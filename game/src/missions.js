// SOLMAR v4 — 5 story missions + taxi fares + 10 hidden packages.
// GPS route: Manhattan path along the road grid, drawn on the minimap.
import * as THREE from 'three';

export const MISSIONS = [
  {
    name: 'First Ride', reward: 500, preset: 'dawn', clock: '06:40',
    steps: [
      { text: 'Steal any car', kind: 'steal-car' },
      { text: 'Drive to the garage', kind: 'goto', target: 'garage' },
    ],
  },
  {
    name: 'Beach Run', reward: 800, preset: 'noon', clock: '12:30', timer: 60,
    steps: [
      { text: 'Get on the motorcycle', kind: 'steal-bike', target: 'bikeSpawn' },
      { text: 'Deliver the package — beach boulevard', kind: 'goto', target: 'beachEnd', timer: 60 },
    ],
  },
  {
    name: 'Bank Job', reward: 1500, preset: 'noon', clock: '12:30',
    steps: [
      { text: 'Grab the cash — 3 points inside the bank', kind: 'bank-cash' },
      { text: 'Escape to the hideout — 3 stars on your tail', kind: 'goto', target: 'hideout', wanted: 3 },
    ],
  },
  {
    name: 'Storm Chase', reward: 2000, preset: 'dusk-rain', clock: '18:20', timer: 45,
    steps: [
      { text: 'Steal the marked sports car', kind: 'steal-sport', target: 'sportSpawn' },
      { text: 'Survive the chase — 45s', kind: 'survive', timer: 45, wanted: 4 },
      { text: 'Reach the marina', kind: 'goto', target: 'marina' },
    ],
  },
  {
    name: 'The Last Boat', reward: 3000, preset: 'night', clock: '22:15',
    steps: [
      { text: 'Board the speedboat at the marina', kind: 'board-boat', target: 'marinaBoat' },
      { text: 'Escape by water to the lighthouse point', kind: 'goto', target: 'lighthouse', wanted: 5 },
    ],
  },
];

export function gpsRoute(from, to) {
  // Manhattan route on the 20 m road grid.
  const pts = [new THREE.Vector3(from.x, 0, from.z)];
  const gx = Math.round(to.x / 20) * 20, gz = Math.round(to.z / 20) * 20;
  const fx = Math.round(from.x / 20) * 20, fz = Math.round(from.z / 20) * 20;
  pts.push(new THREE.Vector3(gx, 0, fz));
  pts.push(new THREE.Vector3(gx, 0, gz));
  pts.push(new THREE.Vector3(to.x, 0, to.z));
  return pts;
}

export class MissionManager {
  constructor(scene, landmarks, onEvent) {
    this.scene = scene; this.landmarks = landmarks; this.onEvent = onEvent;
    this.index = 0; this.step = 0; this.timer = 0; this.done = false;
    this.money = 200; this.packages = 0; this.packageSpots = [];
    this.taxi = null; this.bankCash = 0;
    // beacon: additive cylinder + rotating octahedron diamond
    this.beacon = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cyl.position.y = 15; this.beacon.add(cyl);
    const dia = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color: 0xffd76a }),
    );
    dia.position.y = 4; this.beacon.add(dia);
    this.beacon.userData.diamond = dia;
    scene.add(this.beacon);
    // package markers
    for (const p of landmarks.packages) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: 0x9dff6a }));
      m.position.set(p.x, 1.2, p.z); scene.add(m);
      this.packageSpots.push({ pos: p, mesh: m, got: false });
    }
    this.route = [];
  }
  get mission() { return MISSIONS[this.index]; }
  get stepDef() { return this.mission ? this.mission.steps[this.step] : null; }
  get objectiveText() {
    if (!this.mission) return 'SOLMAR LEGEND — all missions complete';
    return this.stepDef ? this.stepDef.text : '';
  }
  targetPos() {
    const s = this.stepDef;
    if (!s) return null;
    if (s.target && this.landmarks[s.target]) return this.landmarks[s.target];
    if (s.kind === 'bank-cash') return this.landmarks.bankInterior[this.bankCash] || this.landmarks.bank;
    if (s.kind === 'steal-car' || s.kind === 'steal-bike') return null;
    return null;
  }
  startMission(i) {
    this.index = i; this.step = 0; this.timer = 0; this.bankCash = 0; this.done = false;
    const m = this.mission;
    this.onEvent({ type: 'mission-start', mission: m });
    if (m && m.steps[0].wanted) this.onEvent({ type: 'set-wanted', wanted: m.steps[0].wanted });
  }
  advance() {
    this.step++;
    const m = this.mission;
    if (this.step >= m.steps.length) {
      this.money += m.reward;
      this.onEvent({ type: 'mission-complete', mission: m, money: this.money });
      this.index++;
      if (this.index >= MISSIONS.length) { this.done = true; this.onEvent({ type: 'game-complete', money: this.money }); return; }
      this.startMission(this.index);
      return;
    }
    const s = this.stepDef;
    if (s && s.wanted) this.onEvent({ type: 'set-wanted', wanted: s.wanted });
    if (s && s.kind === 'survive') { this.timer = s.timer; this.onEvent({ type: 'roadblock' }); }
  }
  // called every frame with live game state; returns nothing, fires events.
  update(dt, state) {
    this.time = (this.time || 0) + dt;
    const m = this.mission;
    if (!m || this.done) return;
    const s = this.stepDef;
    if (!s) return;
    if (s.timer && this.timer <= 0 && s.kind !== 'survive') this.timer = s.timer;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (s.kind === 'survive') { this.advance(); return; }
        // beach-run timer expired: restart the step timer, keep playing
        this.timer = s.timer;
        this.onEvent({ type: 'timer-fail', mission: m });
      }
    }
    const tp = this.targetPos();
    if (tp) {
      this.beacon.visible = true;
      this.beacon.position.set(tp.x, 0, tp.z);
      this.beacon.userData.diamond.rotation.y += dt * 2;
      this.beacon.userData.diamond.position.y = 4 + Math.sin(this.time * 2) * 0.4;
      this.route = gpsRoute(state.playerPos, tp);
    } else {
      this.beacon.visible = false;
      this.route = [];
    }
    const dist = tp ? Math.hypot(state.playerPos.x - tp.x, state.playerPos.z - tp.z) : 0;
    this._dist = dist;
    switch (s.kind) {
      case 'steal-car': if (state.inVehicle && state.vehicleKind === 'car') this.advance(); break;
      case 'steal-bike': if (state.inVehicle && state.vehicleKind === 'bike') this.advance(); break;
      case 'steal-sport': if (state.inVehicle && state.inSportCar) this.advance(); break;
      case 'board-boat': if (state.inVehicle && state.vehicleKind === 'boat') this.advance(); break;
      case 'bank-cash': {
        if (tp && dist < 3.5) {
          this.bankCash++;
          this.onEvent({ type: 'cash-grab', count: this.bankCash });
          if (this.bankCash >= 3) this.advance();
        }
        break;
      }
      case 'goto': if (tp && dist < (s.target === 'lighthouse' ? 12 : 6)) this.advance(); break;
      default: break;
    }
    // hidden packages
    for (const p of this.packageSpots) {
      if (p.got) continue;
      const d = Math.hypot(state.playerPos.x - p.pos.x, state.playerPos.z - p.pos.z);
      if (d < 3) {
        p.got = true; p.mesh.visible = false;
        this.packages++; this.money += 250;
        this.onEvent({ type: 'package', count: this.packages, money: this.money });
      }
    }
  }
  get distance() { return this._dist || 0; }
  startTaxi(state) {
    if (this.taxi) return;
    const p = state.nearPed;
    if (!p) return;
    const dest = new THREE.Vector3(
      (Math.floor(state.playerPos.x / 20) + (this.rngSign())) * 20, 0,
      (Math.floor(state.playerPos.z / 20) + (this.rngSign())) * 20);
    this.taxi = { from: new THREE.Vector3(p.x, 0, p.z), to: dest, phase: 'pickup', fare: 100 + Math.floor(Math.random() * 2) * 50 };
    this.onEvent({ type: 'taxi-start', taxi: this.taxi });
  }
  rngSign() { return Math.random() < 0.5 ? 6 : -6; }
}
