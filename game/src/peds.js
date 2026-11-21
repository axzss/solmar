// SOLMAR v4 — pedestrians in 3 flavors: commuters (fast), tourists (stroll,
// stop, raise phones), vendors (stand at stalls). They flee gunfire/speeding cars.
import * as THREE from 'three';
import { buildHuman } from './character.js';

const PALETTES = [
  { skin: 0xc98d64, shirt: 0x2a6fd8, pants: 0x23283a, hair: 0x1a1210 },
  { skin: 0x8a5a34, shirt: 0x3fae5a, pants: 0x3a3a3a, hair: 0x0a0a0a },
  { skin: 0xe8b88a, shirt: 0xd8b93a, pants: 0x4a2a2a, hair: 0x6a4a2a },
  { skin: 0xc98d64, shirt: 0xd85aa8, pants: 0x2a2a3a, hair: 0x2a1a0a, female: true },
  { skin: 0x8a5a34, shirt: 0x8a2ad8, pants: 0x1a1a1a, hair: 0x0a0a0a, cap: 0xd82a2a },
];

export class PedManager {
  constructor(scene, rng, count = 16) {
    this.scene = scene; this.rng = rng; this.peds = [];
    for (let i = 0; i < count; i++) {
      const pal = rng.pick(PALETTES);
      const flavor = i < 6 ? 'commuter' : i < 12 ? 'tourist' : 'vendor';
      const human = buildHuman({ height: rng.range(1.62, 1.86), ...pal });
      scene.add(human.group);
      const ped = {
        human, flavor,
        pos: new THREE.Vector3(rng.range(-140, 140), 0, rng.range(-140, 110)),
        heading: rng.next() * Math.PI * 2,
        speed: flavor === 'commuter' ? rng.range(1.6, 2.2) : flavor === 'tourist' ? rng.range(0.7, 1.1) : 0,
        target: null, phase: rng.next() * 10, pause: rng.range(0, 4), flee: 0,
      };
      if (flavor === 'vendor') {
        ped.pos.set(-90 + (i - 12) * 6, 0, 63.5);
      }
      human.group.position.copy(ped.pos);
      this.peds.push(ped);
    }
  }
  scare(x, z, radius = 14) {
    for (const p of this.peds) {
      const dx = p.pos.x - x, dz = p.pos.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        p.flee = 3 + this.rng.next() * 2;
        p.heading = Math.atan2(dx, dz);
      }
    }
  }
  update(dt, playerPos, playerSpeed) {
    for (const p of this.peds) {
      let moving = false;
      if (p.flee > 0) {
        p.flee -= dt; moving = true;
        p.pos.x += Math.sin(p.heading) * 4.2 * dt;
        p.pos.z += Math.cos(p.heading) * 4.2 * dt;
        p.phase += dt * 11;
        p.human.setPose('run', p.phase);
      } else if (p.flavor === 'vendor') {
        p.human.setPose('idle', p.phase); p.phase += dt;
      } else {
        if (p.pause > 0) {
          p.pause -= dt;
          if (p.flavor === 'tourist' && p.pause < 1.2) p.human.setPose('aim', p.phase); // raising phone
          else p.human.setPose('idle', p.phase);
          p.phase += dt;
          continue;
        }
        if (!p.target) {
          p.target = new THREE.Vector3(
            Math.max(-150, Math.min(150, p.pos.x + this.rng.range(-40, 40))), 0,
            Math.max(-150, Math.min(150, p.pos.z + this.rng.range(-40, 40))));
        }
        const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.2) { p.target = null; p.pause = this.rng.range(1, 5); continue; }
        p.heading = Math.atan2(dx, dz);
        p.pos.x += Math.sin(p.heading) * p.speed * dt;
        p.pos.z += Math.cos(p.heading) * p.speed * dt;
        p.phase += dt * (p.flavor === 'commuter' ? 9 : 6);
        p.human.setPose('walk', p.phase);
        moving = true;
        // flee a speeding car right behind them
        const pdx = p.pos.x - playerPos.x, pdz = p.pos.z - playerPos.z;
        if (playerSpeed > 14 && pdx * pdx + pdz * pdz < 36) this.scare(playerPos.x, playerPos.z, 8);
      }
      p.pos.x = Math.max(-155, Math.min(155, p.pos.x));
      p.pos.z = Math.max(-155, Math.min(152, p.pos.z));
      p.human.group.position.copy(p.pos);
      p.human.group.rotation.y = p.heading;
      void moving;
    }
  }
  positions() { return this.peds.map((p) => ({ x: p.pos.x, z: p.pos.z, flavor: p.flavor })); }
}
