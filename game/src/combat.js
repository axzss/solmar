// SOLMAR v4 — combat: fists / pistol (hitscan, tracer, muzzle flash) /
// shotgun (5-pellet spread, knockback). Pickups: health, ammo, armor.
import * as THREE from 'three';
import { rbox, phys, smoothGeo } from './textures.js';

export class Combat {
  constructor(scene, rng, onEvent) {
    this.scene = scene; this.rng = rng; this.onEvent = onEvent;
    this.weapon = 'fists';
    this.ammo = { pistol: 12, shotgun: 6 };
    this.reloadTimer = 0; this.cool = 0;
    this.tracers = [];
    this.pickups = [];
    const defs = [
      { kind: 'health', color: 0x3fae5a, pos: [-40, 60] }, { kind: 'ammo', color: 0xd8b93a, pos: [60, -60] },
      { kind: 'armor', color: 0x54a8ff, pos: [-80, -20] }, { kind: 'health', color: 0x3fae5a, pos: [100, 80] },
      { kind: 'ammo', color: 0xd8b93a, pos: [-20, -100] }, { kind: 'armor', color: 0x54a8ff, pos: [20, 120] },
    ];
    for (const d of defs) {
      const m = new THREE.Mesh(rbox(0.7, 0.7, 0.7, 0.12, 4),
        phys({ color: d.color, emissive: d.color, emissiveIntensity: 0.9, roughness: 0.4 }));
      m.position.set(d.pos[0], 0.9, d.pos[1]);
      scene.add(m);
      this.pickups.push({ kind: d.kind, mesh: m, pos: new THREE.Vector3(d.pos[0], 0, d.pos[1]), taken: false, respawn: 0 });
    }
    // muzzle flash: additive sprite plane
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.4, 'rgba(255,180,60,0.8)'); g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.flashMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(this.flashMat);
    this.flash.scale.set(1.4, 1.4, 1); this.flash.visible = false;
    scene.add(this.flash);
    this.flashTimer = 0;
  }
  setWeapon(name) {
    if (name === 'fists' || name === 'pistol' || name === 'shotgun') this.weapon = name;
  }
  fire(origin, heading, targets, onHit) {
    if (this.cool > 0 || this.reloadTimer > 0) return false;
    const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    if (this.weapon === 'fists') {
      this.cool = 0.45;
      for (const t of targets) {
        const d = Math.hypot(t.pos.x - origin.x, t.pos.z - origin.z);
        if (d < 2.4) { onHit(t, 25, dir); return true; }
      }
      return true;
    }
    const isShotgun = this.weapon === 'shotgun';
    if (this.ammo[this.weapon] <= 0) { this.reload(); return false; }
    this.ammo[this.weapon]--;
    this.cool = isShotgun ? 0.9 : 0.28;
    const pellets = isShotgun ? 5 : 1;
    for (let i = 0; i < pellets; i++) {
      const spread = isShotgun ? this.rng.range(-0.16, 0.16) : this.rng.range(-0.015, 0.015);
      const a = heading + spread;
      const d2 = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const end = origin.clone().addScaledVector(d2, isShotgun ? 16 : 42);
      let best = null, bestD = isShotgun ? 16 : 42;
      for (const t of targets) {
        const to = new THREE.Vector3(t.pos.x - origin.x, 0, t.pos.z - origin.z);
        const dist = to.length();
        if (dist > bestD) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, to.normalize().dot(d2))));
        if (ang < 0.22) { best = t; bestD = dist; }
      }
      if (best) {
        end.copy(best.pos).setY(1.2);
        onHit(best, isShotgun ? 22 : 34, d2);
      }
      this.spawnTracer(origin.clone().setY(1.35), end);
    }
    this.flash.position.copy(origin).addScaledVector(dir, 1.1).setY(1.35);
    this.flash.visible = true; this.flashTimer = 0.06;
    this.onEvent({ type: isShotgun ? 'shotgun' : 'gunshot' });
    return true;
  }
  spawnTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }
  reload() {
    if (this.weapon === 'fists') return;
    if (this.reloadTimer > 0) return;
    this.reloadTimer = 1.1;
    this.onEvent({ type: 'reload' });
  }
  update(dt, playerPos, onPickup) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0 && this.weapon !== 'fists') {
        this.ammo[this.weapon] = this.weapon === 'pistol' ? 12 : 6;
      }
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
    for (const t of this.tracers) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const p of this.pickups) {
      if (p.taken) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.taken = false; p.mesh.visible = true; }
        continue;
      }
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = 0.9 + Math.sin(performance.now() * 0.002 + p.pos.x) * 0.12;
      const d = Math.hypot(playerPos.x - p.pos.x, playerPos.z - p.pos.z);
      if (d < 2.2) {
        p.taken = true; p.mesh.visible = false; p.respawn = 25;
        onPickup(p.kind);
      }
    }
  }
}
