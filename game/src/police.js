// SOLMAR v4 — wanted 0-5 + police: chase cars, foot cops, helicopter with
// searchlight, roadblock + spike strip, police boats near water.
import * as THREE from 'three';
import { makeCar, makeBoat, Driveable } from './vehicles.js';
import { buildHuman } from './character.js';
import { rbox, phys, smoothGeo } from './textures.js';
import { clamp } from './rng.js';

export class PoliceManager {
  constructor(scene, rng, colliders) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.wanted = 0;
    this.decayTimer = 0; this.lastCrime = -99;
    this.cars = []; this.cops = []; this.boats = [];
    this.heli = null; this.roadblock = null;
    this.shootTimer = 0; this.time = 0;
    // helicopter: lathe fuselage + tail boom + rotor + searchlight cone
    const hg = new THREE.Group();
    const fusPts = [[0.001, 0], [0.9, 0.1], [1.2, 0.7], [1.0, 1.3], [0.5, 1.7], [0.001, 1.8]].map(([r, y]) => new THREE.Vector2(r, y));
    const fus = new THREE.Mesh(smoothGeo(new THREE.LatheGeometry(fusPts, 16)), phys({ color: 0x1a2a4a, metalness: 0.5, roughness: 0.4, clearcoat: 0.6 }));
    fus.scale.set(1, 1, 1.9); fus.position.y = 0.4; hg.add(fus);
    const boom = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 10)), phys({ color: 0x1a2a4a, roughness: 0.5 }));
    boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.0, -2.6); hg.add(boom);
    const rotor = new THREE.Group(); rotor.position.y = 2.1; hg.add(rotor);
    const blade = new THREE.Mesh(rbox(7.5, 0.07, 0.3, 0.03, 2), phys({ color: 0x111111, roughness: 0.4 }));
    rotor.add(blade); hg.userData.rotor = rotor;
    const glass = new THREE.Mesh(rbox(1.4, 0.7, 1.2, 0.1, 3), phys({ color: 0x9fd8e8, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 }));
    glass.position.set(0, 0.9, 1.0); hg.add(glass);
    // searchlight: additive cone + real spotlight
    const coneGeo = new THREE.ConeGeometry(4.5, 26, 18, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = -13; cone.rotation.x = Math.PI; hg.add(cone);
    const spot = new THREE.SpotLight(0xfff2b0, 0, 60, 0.22, 0.5, 1.0);
    spot.position.set(0, 0, 0); const st = new THREE.Object3D(); st.position.set(0, -30, 0);
    hg.add(st); spot.target = st; hg.add(spot);
    hg.userData.cone = cone; hg.userData.spot = spot;
    hg.visible = false; scene.add(hg);
    this.heli = { group: hg, angle: 0 };
  }
  addCrime(n, t) { this.wanted = clamp(this.wanted + n, 0, 5); this.lastCrime = t; this.decayTimer = 0; }
  setWanted(n, t = 0) { this.wanted = clamp(n, 0, 5); this.lastCrime = t; }
  clear() { this.wanted = 0; }
  spawnRoadblockAhead(pos, heading) {
    this.clearRoadblock();
    const g = new THREE.Group();
    const cars = [];
    for (const s of [-1, 1]) {
      const built = makeCar(0x1a1a22, { police: true });
      built.group.position.set(Math.cos(heading) * s * 4, 0, -Math.sin(heading) * s * 4);
      built.group.rotation.y = heading + Math.PI / 2;
      g.add(built.group); cars.push(built);
    }
    // spike strip: beveled base + cone spikes
    const strip = new THREE.Group();
    const base = new THREE.Mesh(rbox(7, 0.12, 0.9, 0.04, 3), phys({ color: 0x222222, roughness: 0.6 }));
    strip.add(base);
    for (let i = -3; i <= 3; i++) {
      const spike = new THREE.Mesh(smoothGeo(new THREE.ConeGeometry(0.09, 0.35, 8)), phys({ color: 0xcccccc, metalness: 0.9, roughness: 0.25 }));
      spike.position.set(i * 0.9, 0.22, 0); strip.add(spike);
    }
    strip.position.set(0, 0.06, 0); g.add(strip);
    g.position.set(pos.x + Math.sin(heading) * 26, 0, pos.z + Math.cos(heading) * 26);
    g.rotation.y = heading;
    this.scene.add(g);
    this.roadblock = { group: g, pos: g.position.clone(), cars, stripPos: g.position.clone(), hit: false };
  }
  clearRoadblock() {
    if (!this.roadblock) return;
    this.scene.remove(this.roadblock.group);
    this.roadblock = null;
  }
  update(dt, t, player, cb) {
    this.time = t;
    // decay: no crime + no cop near for a while
    if (this.wanted > 0 && t - this.lastCrime > 22) {
      this.decayTimer += dt;
      if (this.decayTimer > 6) { this.wanted = Math.max(0, this.wanted - 1); this.decayTimer = 0; this.lastCrime = t; }
    }
    // --- police cars: count follows stars
    const wantCars = this.wanted >= 1 ? Math.min(4, this.wanted) : 0;
    while (this.cars.length < wantCars) {
      const built = makeCar(0x1a1a22, { police: true });
      this.scene.add(built.group);
      const d = new Driveable(built, new THREE.Vector3(
        player.pos.x + this.rng.range(-50, 50), 0, player.pos.z + this.rng.range(-50, 50)), 0);
      this.cars.push(d);
    }
    while (this.cars.length > wantCars) {
      const d = this.cars.pop(); this.scene.remove(d.group);
    }
    for (const d of this.cars) {
      const dx = player.pos.x - d.pos.x, dz = player.pos.z - d.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - d.heading;
      dh = ((dh + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const steer = clamp(dh * 1.4, -1, 1);
      d.speed = Math.min(d.speed + 14 * dt, dist < 6 ? 12 : 34);
      d.heading += steer * 1.9 * dt;
      d.pos.x += Math.sin(d.heading) * d.speed * dt;
      d.pos.z += Math.cos(d.heading) * d.speed * dt;
      d.group.position.copy(d.pos); d.group.rotation.y = d.heading;
      d.wheelSpin += (d.speed / 0.36) * dt;
      for (const w of d.built.wheels) w.mesh.rotation.x = d.wheelSpin;
      // light-bar strobe
      const flash = Math.sin(t * 14) > 0;
      if (d.built.lightBar) {
        d.built.lightBar.red.material.emissiveIntensity = flash ? 3.5 : 0.4;
        d.built.lightBar.blue.material.emissiveIntensity = flash ? 0.4 : 3.5;
      }
      // ram damage
      if (dist < 3.2 && player.vehicle) cb.onRam && cb.onRam(4 * dt * 10);
      if (dist < 3.0 && !player.vehicle) cb.onDamage && cb.onDamage(6 * dt);
    }
    // --- foot cops at >= 2 stars
    const wantCops = this.wanted >= 2 ? Math.min(4, this.wanted) : 0;
    while (this.cops.length < wantCops) {
      const h = buildHuman({ skin: 0xc98d64, shirt: 0x1a2a4a, pants: 0x1a1a22, hair: 0x1a1210, cap: 0x1a2a4a, height: 1.8 });
      this.scene.add(h.group);
      this.cops.push({ human: h, pos: new THREE.Vector3(player.pos.x + this.rng.range(-30, 30), 0, player.pos.z + this.rng.range(-30, 30)), heading: 0, phase: 0, health: 50 });
    }
    while (this.cops.length > wantCops) {
      const c = this.cops.pop(); this.scene.remove(c.human.group);
    }
    this.shootTimer -= dt;
    for (const c of this.cops) {
      const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      c.heading = Math.atan2(dx, dz);
      if (dist > 9) {
        c.pos.x += Math.sin(c.heading) * 3.4 * dt;
        c.pos.z += Math.cos(c.heading) * 3.4 * dt;
        c.phase += dt * 9; c.human.setPose('run', c.phase);
      } else {
        c.human.setPose('aim', c.phase);
        if (this.shootTimer <= 0 && dist < 26) {
          this.shootTimer = 1.1;
          cb.onCopShot && cb.onCopShot(c.pos);
          if (this.rng.chance(0.4)) cb.onDamage && cb.onDamage(7);
        }
      }
      c.human.group.position.copy(c.pos);
      c.human.group.rotation.y = c.heading;
    }
    // --- helicopter at >= 4
    const heliOn = this.wanted >= 4;
    this.heli.group.visible = heliOn;
    if (heliOn) {
      this.heli.angle += dt * 0.45;
      const hx = player.pos.x + Math.sin(this.heli.angle) * 16;
      const hz = player.pos.z + Math.cos(this.heli.angle) * 16;
      this.heli.group.position.set(hx, 42, hz);
      this.heli.group.rotation.y = Math.atan2(player.pos.x - hx, player.pos.z - hz);
      this.heli.group.userData.rotor.rotation.y += dt * 22;
      const night = cb.isNight && cb.isNight();
      this.heli.group.userData.cone.visible = night;
      this.heli.group.userData.spot.intensity = night ? 400 : 0;
    }
    // --- police boats at >= 4 near water
    const wantBoats = (this.wanted >= 4 && player.pos.z > 110) ? 2 : 0;
    while (this.boats.length < wantBoats) {
      const built = makeBoat(0x1a2a4a);
      this.scene.add(built.group);
      this.boats.push({ built, pos: new THREE.Vector3(player.pos.x + this.rng.range(-30, 30), 0, 175), heading: 0 });
    }
    while (this.boats.length > wantBoats) {
      const b = this.boats.pop(); this.scene.remove(b.built.group);
    }
    for (const b of this.boats) {
      const dx = player.pos.x - b.pos.x, dz = player.pos.z - b.pos.z;
      b.heading = Math.atan2(dx, dz);
      b.pos.x += Math.sin(b.heading) * 16 * dt;
      b.pos.z += Math.cos(b.heading) * 16 * dt;
      b.pos.z = Math.min(220, Math.max(160, b.pos.z));
      b.built.group.position.set(b.pos.x, -0.1, b.pos.z);
      b.built.group.rotation.y = b.heading;
    }
    // spike strip hit?
    if (this.roadblock && !this.roadblock.hit && player.vehicle) {
      const d = Math.hypot(player.pos.x - this.roadblock.stripPos.x, player.pos.z - this.roadblock.stripPos.z);
      if (d < 4) {
        this.roadblock.hit = true;
        cb.onSpike && cb.onSpike();
      }
    }
  }
  blips() {
    return {
      cars: this.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      cops: this.cops.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      heli: this.heli.group.visible ? { x: this.heli.group.position.x, z: this.heli.group.position.z } : null,
      boats: this.boats.map((b) => ({ x: b.pos.x, z: b.pos.z })),
      roadblock: this.roadblock ? { x: this.roadblock.stripPos.x, z: this.roadblock.stripPos.z } : null,
    };
  }
}
