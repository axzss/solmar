// SOLMAR v4 — traffic: cars/trucks/buses looping road-grid rectangles,
// despawning/respawning around the player to hold density.
import * as THREE from 'three';
import { makeCar } from './vehicles.js';

export class TrafficManager {
  constructor(scene, rng, count = 10) {
    this.scene = scene; this.rng = rng; this.cars = [];
    const palette = [0x3a5a8a, 0x8a3a3a, 0xd8d8d8, 0x2a2a2a, 0x8a6a2a, 0x3a8a5a, 0x6a3a8a];
    for (let i = 0; i < count; i++) {
      const truck = rng.chance(0.18);
      const built = makeCar(rng.pick(palette), { truck });
      scene.add(built.group);
      const car = {
        built, speed: rng.range(7, 13), heading: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
        pos: new THREE.Vector3(rng.range(-140, 140), 0, rng.range(-140, 140)),
        leg: rng.range(20, 80), wheelSpin: 0,
      };
      car.pos.x = Math.round(car.pos.x / 20) * 20;
      car.pos.z = Math.round(car.pos.z / 20) * 20;
      this.cars.push(car);
    }
  }
  update(dt, playerPos) {
    for (const c of this.cars) {
      // drive straight along the current heading, turn at block ends
      c.pos.x += Math.sin(c.heading) * c.speed * dt;
      c.pos.z += Math.cos(c.heading) * c.speed * dt;
      c.leg -= c.speed * dt;
      if (c.leg <= 0 || Math.abs(c.pos.x) > 155 || Math.abs(c.pos.z) > 150) {
        c.heading += this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
        c.pos.x = Math.max(-150, Math.min(150, c.pos.x));
        c.pos.z = Math.max(-150, Math.min(150, c.pos.z));
        c.leg = this.rng.range(20, 90);
      }
      c.built.group.position.copy(c.pos);
      c.built.group.rotation.y = c.heading - Math.PI * 0.5;
      c.wheelSpin += (c.speed / 0.36) * dt;
      for (const w of c.built.wheels) w.spin.rotation.z = c.wheelSpin;
      // respawn near the player when far away
      const dx = c.pos.x - playerPos.x, dz = c.pos.z - playerPos.z;
      if (dx * dx + dz * dz > 130 * 130) {
        c.pos.set(
          Math.max(-150, Math.min(150, playerPos.x + this.rng.range(-90, 90))),
          0,
          Math.max(-150, Math.min(150, playerPos.z + this.rng.range(-90, 90))),
        );
        c.pos.x = Math.round(c.pos.x / 20) * 20;
        c.pos.z = Math.round(c.pos.z / 20) * 20;
      }
    }
  }
  positions() { return this.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })); }
}
