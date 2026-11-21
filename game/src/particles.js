// SOLMAR v4 — particles: GPU-ish rain streaks, debris bursts, smoke sprites,
// explosion flash, boat wake foam, hydrant spray.
import * as THREE from 'three';
import { smoothGeo, rbox } from './textures.js';

function radialSpriteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Particles {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.spriteTex = radialSpriteTexture();
    // rain: 2600 line segments in a box that follows the camera
    const N = 2600;
    this.rainN = N;
    const pos = new Float32Array(N * 6);
    this.rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = rng.range(-40, 40), y = rng.range(0, 30), z = rng.range(-40, 40);
      pos.set([x, y, z, x + 0.12, y - 0.9, z + 0.05], i * 6);
      this.rainVel[i] = rng.range(22, 30);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
      color: 0xaac4d8, transparent: true, opacity: 0.35, depthWrite: false,
    }));
    this.rain.visible = false; this.rain.frustumCulled = false;
    scene.add(this.rain);
    // debris pool
    this.debris = [];
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(rbox(0.14, 0.14, 0.14, 0.05, 2),
        new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true }));
      m.visible = false; scene.add(m);
      this.debris.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    // smoke sprites
    this.smoke = [];
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.spriteTex, color: 0x555555, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; scene.add(s);
      this.smoke.push({ sprite: s, life: 0, max: 1, vel: new THREE.Vector3() });
    }
    // wake foam points
    const WN = 220;
    const wpos = new Float32Array(WN * 3);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    this.wake = new THREE.Points(wg, new THREE.PointsMaterial({ color: 0xdff2f8, size: 0.9, transparent: true, opacity: 0.75, depthWrite: false, map: this.spriteTex }));
    this.wake.visible = false; this.wake.frustumCulled = false;
    scene.add(this.wake);
    this.wakeIdx = 0; this.wakeLife = new Float32Array(WN);
    this.explosionLight = new THREE.PointLight(0xffa040, 0, 30, 1.5);
    scene.add(this.explosionLight);
  }
  setRain(on) { this.rain.visible = on; }
  updateRain(dt, center) {
    if (!this.rain.visible) return;
    const attr = this.rain.geometry.attributes.position;
    const a = attr.array;
    for (let i = 0; i < this.rainN; i++) {
      let y = a[i * 6 + 1] - this.rainVel[i] * dt;
      if (y < 0) { y = 28; a[i * 6] = center.x + this.rng.range(-40, 40); a[i * 6 + 2] = center.z + this.rng.range(-40, 40); }
      a[i * 6 + 1] = y; a[i * 6 + 4] = y - 0.9;
      a[i * 6 + 3] = a[i * 6] + 0.12; a[i * 6 + 5] = a[i * 6 + 2] + 0.05;
    }
    attr.needsUpdate = true;
    this.rain.position.set(0, 0, 0);
  }
  burst(pos, color = 0xffa040, n = 26, speed = 9) {
    let c = 0;
    for (const d of this.debris) {
      if (d.life > 0) continue;
      d.life = 0.7 + this.rng.next() * 0.6;
      d.mesh.visible = true;
      d.mesh.material.color.setHex(color);
      d.mesh.material.opacity = 1;
      d.mesh.position.copy(pos);
      d.vel.set(this.rng.range(-1, 1), this.rng.range(0.4, 1.4), this.rng.range(-1, 1)).normalize().multiplyScalar(speed * this.rng.range(0.4, 1));
      if (++c >= n) break;
    }
    this.explosionLight.position.copy(pos).setY(pos.y + 2);
    this.explosionLight.intensity = 900;
  }
  smokePuff(pos, n = 4) {
    let c = 0;
    for (const s of this.smoke) {
      if (s.life > 0) continue;
      s.life = s.max = 1.6 + this.rng.next();
      s.sprite.visible = true;
      s.sprite.position.copy(pos).add(new THREE.Vector3(this.rng.range(-0.5, 0.5), this.rng.range(0, 0.5), this.rng.range(-0.5, 0.5)));
      s.sprite.scale.set(1, 1, 1);
      s.vel.set(this.rng.range(-0.4, 0.4), this.rng.range(0.8, 1.6), this.rng.range(-0.4, 0.4));
      if (++c >= n) break;
    }
  }
  wakeAt(pos, speed) {
    if (speed < 4) return;
    const attr = this.wake.geometry.attributes.position;
    for (let k = 0; k < 3; k++) {
      const i = this.wakeIdx; this.wakeIdx = (this.wakeIdx + 1) % 220;
      attr.setXYZ(i, pos.x + this.rng.range(-0.8, 0.8), 0.1, pos.z + this.rng.range(-0.8, 0.8));
      this.wakeLife[i] = 1.2;
    }
    attr.needsUpdate = true;
    this.wake.visible = true;
  }
  update(dt) {
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vel.y -= 14 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += dt * 6; d.mesh.rotation.y += dt * 5;
      d.mesh.material.opacity = Math.max(0, d.life);
      if (d.life <= 0 || d.mesh.position.y < 0) d.mesh.visible = false;
    }
    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.sprite.position.addScaledVector(s.vel, dt);
      const k = 1 + (s.max - s.life) * 1.4;
      s.sprite.scale.set(k, k, 1);
      s.sprite.material.opacity = Math.max(0, s.life / s.max) * 0.5;
      if (s.life <= 0) s.sprite.visible = false;
    }
    const attr = this.wake.geometry.attributes.position;
    let any = false;
    for (let i = 0; i < 220; i++) {
      if (this.wakeLife[i] > 0) { this.wakeLife[i] -= dt; any = true; if (this.wakeLife[i] <= 0) attr.setY(i, -10); }
    }
    if (any) attr.needsUpdate = true;
    this.explosionLight.intensity = Math.max(0, this.explosionLight.intensity - dt * 2600);
  }
}
