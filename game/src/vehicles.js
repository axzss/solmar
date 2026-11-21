// SOLMAR v4 — vehicles, kitbashed: RoundedBox chassis + narrower greenhouse +
// TorusGeometry wheel arches + scaled-sphere hood/trunk bulges + Lathe rims.
// Boat hull: Lathe profile scaled long + beveled deck extrude.
import * as THREE from 'three';
import { rbox, bevelExtrude, rectShape, phys, paintMat, fabricMat, glassMat, lensMat, rubberMat, chromeMat, smoothGeo } from './textures.js';
import { clamp, damp, angleLerp } from './rng.js';

function latheRim() {
  const pts = [
    [0.001, -0.06], [0.16, -0.06], [0.20, -0.03], [0.21, 0.0], [0.20, 0.03], [0.16, 0.06], [0.001, 0.06],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = smoothGeo(new THREE.LatheGeometry(pts, 20));
  return new THREE.Mesh(g, chromeMat());
}
function makeWheel(radius = 0.36, width = 0.24) {
  const g = new THREE.Group();
  const tireGeo = smoothGeo(new THREE.CylinderGeometry(radius, radius, width, 20));
  tireGeo.rotateZ(Math.PI / 2);
  try { tireGeo.computeTangents(); } catch (e) { /* tangents optional */ }
  const tire = new THREE.Mesh(tireGeo, rubberMat());
  tire.castShadow = true; g.add(tire);
  const rim = latheRim(); rim.rotation.z = Math.PI / 2; rim.scale.setScalar(radius / 0.21); g.add(rim);
  const disc = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 16)), phys({ color: 0x888888, metalness: 0.9, roughness: 0.3 }));
  disc.geometry.rotateZ(Math.PI / 2); g.add(disc);
  return g;
}

export function makeCar(color = 0xd82a2a, opts = {}) {
  const { police = false, sport = false, taxi = false, truck = false } = opts;
  const g = new THREE.Group();
  const L = truck ? 6.4 : sport ? 4.5 : 4.4;
  const W = truck ? 2.2 : 1.9;
  const body = paintMat(police ? 0x1a1a22 : color, { metalness: 0.7, roughness: sport ? 0.18 : 0.3 });
  // chassis
  const chassis = new THREE.Mesh(rbox(L, 0.62, W, 0.09, 6), body);
  chassis.position.y = 0.62; chassis.castShadow = true; g.add(chassis);
  // hood + trunk bulges: scaled spheres
  const bulge = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(1.15, 18, 12)), body);
  bulge.scale.set(0.95, 0.16, W / 2.1); bulge.position.set(L * 0.32, 0.95, 0); bulge.castShadow = true; g.add(bulge);
  const bulge2 = bulge.clone(); bulge2.position.x = -L * 0.32; g.add(bulge2);
  // greenhouse, narrower + raked
  if (!truck) {
    const cabin = new THREE.Mesh(rbox(L * 0.48, 0.55, W * 0.82, 0.07, 6), glassMat(0x1a2a38, 0.72));
    cabin.position.set(-L * 0.05, 1.18, 0); cabin.castShadow = true; g.add(cabin);
    const roof = new THREE.Mesh(rbox(L * 0.42, 0.1, W * 0.78, 0.05, 5), body);
    roof.position.set(-L * 0.05, 1.48, 0); roof.castShadow = true; g.add(roof);
  } else {
    const cab = new THREE.Mesh(rbox(1.5, 1.5, W * 0.92, 0.08, 5), body);
    cab.position.set(L * 0.32, 1.55, 0); cab.castShadow = true; g.add(cab);
    const shield = new THREE.Mesh(rbox(0.1, 0.8, W * 0.8, 0.04, 4), glassMat());
    shield.position.set(L * 0.32 + 0.75, 1.7, 0); g.add(shield);
    const cargo = new THREE.Mesh(rbox(L * 0.55, 1.9, W, 0.08, 4), phys({ color: 0xcfc8b8, roughness: 0.7 }));
    cargo.position.set(-L * 0.16, 1.85, 0); cargo.castShadow = true; g.add(cargo);
  }
  // wheel arches: torus lips over each wheel
  const wheels = [];
  const wheelPos = [[L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, W / 2], [-L * 0.32, -W / 2]];
  for (const [wx, wz] of wheelPos) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.09, 10, 18, Math.PI), body);
    arch.position.set(wx, 0.42, wz + (wz > 0 ? 0.02 : -0.02));
    arch.rotation.y = Math.PI / 2; arch.rotation.z = 0;
    arch.rotation.x = wz > 0 ? 0 : 0;
    // torus arc faces outward along z
    arch.rotation.set(0, wz > 0 ? 0 : Math.PI, 0);
    g.add(arch);
    const wheel = makeWheel(truck ? 0.44 : 0.36, truck ? 0.3 : 0.24);
    wheel.position.set(wx, 0.36, wz);
    g.add(wheel);
    wheels.push({ mesh: wheel, steer: wx > 0 });
  }
  // bumpers: beveled extrudes
  for (const s of [1, -1]) {
    const bump = new THREE.Mesh(bevelExtrude(rectShape(W, 0.34), 0.3, 0.06, 0.06, 3), phys({ color: 0x1c1e24, metalness: 0.6, roughness: 0.4 }));
    bump.position.set(s * (L / 2 + 0.05), 0.42, 0);
    bump.rotation.y = Math.PI / 2;
    g.add(bump);
  }
  // grille + mirrors + plates
  const grille = new THREE.Mesh(rbox(0.08, 0.22, W * 0.6, 0.03, 3), phys({ color: 0x0c0c0e, metalness: 0.8, roughness: 0.3 }));
  grille.position.set(L / 2 + 0.02, 0.62, 0); g.add(grille);
  for (const s of [1, -1]) {
    const mir = new THREE.Mesh(rbox(0.1, 0.08, 0.22, 0.03, 3), body);
    mir.position.set(L * 0.12, 1.15, s * (W / 2 + 0.1)); g.add(mir);
  }
  // headlights: transmission lens + emissive core; taillights: extrude lenses
  const headMat = lensMat(0xfff6d8);
  const headCore = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const heads = [];
  for (const s of [1, -1]) {
    const lens = new THREE.Mesh(rbox(0.08, 0.16, 0.34, 0.03, 3), headMat);
    lens.position.set(L / 2 + 0.03, 0.78, s * (W / 2 - 0.28)); g.add(lens);
    const core = new THREE.Mesh(rbox(0.04, 0.1, 0.26, 0.02, 2), headCore);
    core.position.set(L / 2 + 0.08, 0.78, s * (W / 2 - 0.28)); g.add(core);
    heads.push(core);
    const tail = new THREE.Mesh(bevelExtrude(rectShape(0.34, 0.16), 0.08, 0.04, 0.04, 3),
      phys({ color: 0x8a0f0f, emissive: 0xff1e1e, emissiveIntensity: 1.6, roughness: 0.2, clearcoat: 1 }));
    tail.position.set(-L / 2 - 0.06, 0.82, s * (W / 2 - 0.28));
    tail.rotation.y = Math.PI / 2;
    g.add(tail);
  }
  // headlight beams (real spotlights, toggled at night/dusk)
  const beams = [];
  for (const s of [1, -1]) {
    const sp = new THREE.SpotLight(0xffeebb, 0, 26, 0.5, 0.45, 1.2);
    sp.position.set(L / 2, 0.8, s * (W / 2 - 0.28));
    const tgt = new THREE.Object3D(); tgt.position.set(L / 2 + 12, 0, s * (W / 2 - 0.28));
    g.add(tgt); sp.target = tgt; g.add(sp); beams.push(sp);
  }
  let lightBar = null;
  if (police) {
    const housing = new THREE.Mesh(bevelExtrude(rectShape(1.0, 0.3), 0.28, 0.05, 0.05, 3), phys({ color: 0x111116, roughness: 0.3 }));
    housing.position.set(-0.1, 1.62, 0); housing.rotation.y = Math.PI / 2; g.add(housing);
    const red = new THREE.Mesh(rbox(0.42, 0.16, 0.26, 0.03, 3), phys({ color: 0x7a0a0a, emissive: 0xff2020, emissiveIntensity: 2.5 }));
    red.position.set(-0.1, 1.66, 0.24); g.add(red);
    const blue = new THREE.Mesh(rbox(0.42, 0.16, 0.26, 0.03, 3), phys({ color: 0x0a0a7a, emissive: 0x2244ff, emissiveIntensity: 2.5 }));
    blue.position.set(-0.1, 1.66, -0.24); g.add(blue);
    lightBar = { red, blue };
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    door.position.set(0.1, 0.75, W / 2 + 0.01); g.add(door);
  }
  if (taxi) {
    const sign = new THREE.Mesh(rbox(0.5, 0.16, 0.3, 0.04, 3), phys({ color: 0xf2c81a, emissive: 0xaa8811, emissiveIntensity: 0.8 }));
    sign.position.set(-0.05, 1.62, 0); g.add(sign);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, heads, beams, lightBar, length: L, width: W, kind: truck ? 'truck' : 'car' };
}

export function makeBike(color = 0xd82a2a) {
  const g = new THREE.Group();
  const body = paintMat(color, { metalness: 0.7, roughness: 0.22 });
  // frame: beveled extrude spine
  const spine = new THREE.Mesh(bevelExtrude(rectShape(1.5, 0.22), 0.16, 0.05, 0.05, 3), phys({ color: 0x1c1e24, metalness: 0.8, roughness: 0.35 }));
  spine.position.set(0, 0.62, 0); spine.rotation.y = Math.PI / 2; g.add(spine);
  // fuel tank: teardrop scaled sphere
  const tank = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.32, 18, 12)), body);
  tank.scale.set(1.5, 0.75, 0.62); tank.position.set(0.28, 0.88, 0); tank.castShadow = true; g.add(tank);
  // seat + tail: rounded boxes
  const seat = new THREE.Mesh(rbox(0.75, 0.12, 0.3, 0.05, 4), fabricMat(0x14100e));
  seat.position.set(-0.42, 0.82, 0); seat.castShadow = true; g.add(seat);
  const tail = new THREE.Mesh(rbox(0.4, 0.1, 0.26, 0.04, 4), body);
  tail.position.set(-0.85, 0.86, 0); tail.rotation.z = 0.25; g.add(tail);
  // fenders: rounded boxes curved over wheels
  for (const [fx, tilt] of [[0.78, -0.35], [-0.78, 0.3]]) {
    const f = new THREE.Mesh(rbox(0.5, 0.08, 0.24, 0.04, 4), body);
    f.position.set(fx, 0.72, 0); f.rotation.z = tilt; f.castShadow = true; g.add(f);
  }
  // forks: angled cylinders + handlebars
  for (const s of [1, -1]) {
    const fork = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.035, 0.03, 0.85, 10)), chromeMat());
    fork.position.set(0.72, 0.62, s * 0.09); fork.rotation.z = 0.42; g.add(fork);
  }
  const bars = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8)), chromeMat());
  bars.rotation.x = Math.PI / 2; bars.position.set(0.52, 1.02, 0); g.add(bars);
  // exhaust: lathe tip
  const exPts = [[0.001, 0], [0.07, 0], [0.075, 0.5], [0.09, 0.62], [0.001, 0.64]].map(([r, y]) => new THREE.Vector2(r, y));
  const exhaust = new THREE.Mesh(smoothGeo(new THREE.LatheGeometry(exPts, 14)), chromeMat());
  exhaust.rotation.z = Math.PI / 2 - 0.06; exhaust.position.set(-0.75, 0.42, 0.12); g.add(exhaust);
  // headlight lens + taillight
  const head = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.09, 12, 10)), lensMat(0xfff6d8));
  head.position.set(0.86, 0.92, 0); head.scale.set(0.6, 1, 1); g.add(head);
  const tailL = new THREE.Mesh(rbox(0.06, 0.08, 0.16, 0.02, 2), phys({ color: 0x8a0f0f, emissive: 0xff1e1e, emissiveIntensity: 2 }));
  tailL.position.set(-1.02, 0.88, 0); g.add(tailL);
  // wheels
  const wheels = [];
  for (const wx of [0.78, -0.78]) {
    const wheel = makeWheel(0.33, 0.14);
    wheel.position.set(wx, 0.33, 0); g.add(wheel); wheels.push({ mesh: wheel, steer: wx > 0 });
  }
  const beam = new THREE.SpotLight(0xffeebb, 0, 22, 0.45, 0.5, 1.2);
  beam.position.set(0.86, 0.92, 0);
  const tgt = new THREE.Object3D(); tgt.position.set(10, 0, 0); g.add(tgt); beam.target = tgt; g.add(beam);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, heads: [], beams: [beam], lightBar: null, length: 2.1, width: 0.5, kind: 'bike' };
}

export function makeBoat(color = 0x2a6fd8) {
  const g = new THREE.Group();
  const gel = paintMat(color, { metalness: 0.4, roughness: 0.16 });
  // hull: Lathe profile revolved, then stretched long — pointed bow/stern
  const prof = [
    [0.001, 0], [0.55, 0.02], [0.95, 0.18], [1.0, 0.42], [0.92, 0.62], [0.7, 0.72], [0.001, 0.74],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const hullGeo = smoothGeo(new THREE.LatheGeometry(prof, 20));
  hullGeo.scale(1, 1, 2.6);
  const hull = new THREE.Mesh(hullGeo, gel);
  hull.position.y = -0.1; hull.castShadow = true; g.add(hull);
  // deck: beveled extrude, rounded-rect outline
  const deckShape = new THREE.Shape();
  deckShape.moveTo(-2.4, 0); deckShape.quadraticCurveTo(-2.6, 0.8, -1.6, 0.95);
  deckShape.lineTo(1.6, 0.95); deckShape.quadraticCurveTo(2.6, 0.8, 2.6, 0);
  deckShape.quadraticCurveTo(2.6, -0.8, 1.6, -0.95); deckShape.lineTo(-1.6, -0.95);
  deckShape.quadraticCurveTo(-2.6, -0.8, -2.4, 0);
  const deck = new THREE.Mesh(bevelExtrude(deckShape, 0.12, 0.06, 0.06, 4), phys({ color: 0xf2efe8, roughness: 0.5, clearcoat: 0.6 }));
  deck.rotation.x = -Math.PI / 2; deck.position.y = 0.62; deck.castShadow = true; g.add(deck);
  // windshield + console + seats + outboard
  const shield = new THREE.Mesh(rbox(0.08, 0.55, 1.3, 0.04, 3), glassMat());
  shield.position.set(0.7, 1.0, 0); shield.rotation.z = -0.25; g.add(shield);
  const consoleM = new THREE.Mesh(rbox(0.5, 0.8, 1.0, 0.06, 3), phys({ color: 0x22303a, roughness: 0.5 }));
  consoleM.position.set(0.5, 1.0, 0); consoleM.castShadow = true; g.add(consoleM);
  for (const sx of [-0.6, -1.3]) {
    const seat = new THREE.Mesh(rbox(0.55, 0.5, 1.4, 0.08, 3), fabricMat(0xf2f2f2));
    seat.position.set(sx, 0.95, 0); seat.castShadow = true; g.add(seat);
  }
  const motor = new THREE.Mesh(rbox(0.4, 0.7, 0.35, 0.08, 3), phys({ color: 0x1c1e24, metalness: 0.6, roughness: 0.4 }));
  motor.position.set(-2.6, 0.5, 0); g.add(motor);
  const stripe = new THREE.Mesh(rbox(4.6, 0.14, 0.04, 0.02, 2), phys({ color: 0xffffff, roughness: 0.3, clearcoat: 0.8 }));
  stripe.position.set(0, 0.35, 1.0); g.add(stripe);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels: [], heads: [], beams: [], lightBar: null, length: 5.4, width: 2.0, kind: 'boat' };
}

// ---- arcade drive physics (shared by player vehicles + traffic is separate)
export class Driveable {
  constructor(built, pos, heading = 0) {
    this.built = built; this.group = built.group;
    this.pos = pos.clone(); this.pos.y = 0;
    this.heading = heading; this.speed = 0; this.steer = 0;
    this.health = 100; this.wheelSpin = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = heading;
  }
  get kind() { return this.built.kind; }
  update(dt, input, colliders, onWaterOk = false) {
    const maxSpeed = this.kind === 'bike' ? 46 : this.kind === 'boat' ? 40 : this.built.length > 6 ? 26 : 38;
    const accel = this.kind === 'bike' ? 26 : 20;
    if (input.f > 0) this.speed += accel * dt * input.f;
    if (input.f < 0) this.speed += (this.speed > 0.5 ? -30 : -9) * dt;
    this.speed -= this.speed * 0.25 * dt; // drag
    if (input.handbrake) { this.speed *= Math.max(0, 1 - 2.2 * dt); }
    this.speed = clamp(this.speed, -10, maxSpeed);
    const steerTarget = input.s * clamp(Math.abs(this.speed) / 12, 0.25, 1) * (this.speed < 0 ? -1 : 1);
    this.steer = damp(this.steer, steerTarget, 8, dt);
    const turnRate = this.kind === 'bike' ? 2.0 : 1.55;
    this.heading += this.steer * turnRate * dt * (input.handbrake ? 1.6 : 1);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    // collision: AABB push-out
    let cx = nx, cz = nz;
    for (const c of colliders) {
      const pad = 0.9;
      if (cx > c.minX - pad && cx < c.maxX + pad && cz > c.minZ - pad && cz < c.maxZ + pad) {
        const dxl = cx - (c.minX - pad), dxr = (c.maxX + pad) - cx;
        const dzl = cz - (c.minZ - pad), dzr = (c.maxZ + pad) - cz;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) cx = c.minX - pad; else if (m === dxr) cx = c.maxX + pad;
        else if (m === dzl) cz = c.minZ - pad; else cz = c.maxZ + pad;
        this.speed *= 0.55;
      }
    }
    // land vehicles cannot enter the water
    if (!onWaterOk) {
      if (cz > 152) { cz = 152; this.speed *= 0.5; }
      if (cx > 158) { cx = 158; this.speed *= 0.5; }
      if (cx < -158) { cx = -158; this.speed *= 0.5; }
      if (cz < -158) { cz = -158; this.speed *= 0.5; }
    }
    this.pos.x = cx; this.pos.z = cz;
    this.group.position.set(this.pos.x, this.kind === 'boat' ? -0.15 + Math.sin(performance.now() * 0.001) * 0.05 : 0, this.pos.z);
    this.group.rotation.y = this.heading;
    // lean: bikes lean into turns, cars roll slightly, boats pitch with speed
    const lean = -this.steer * (this.kind === 'bike' ? 0.45 : 0.06);
    this.group.rotation.z = damp(this.group.rotation.z, lean, 6, dt);
    if (this.kind === 'boat') this.group.rotation.x = damp(this.group.rotation.x, -this.speed * 0.002, 4, dt);
    // wheels spin + front steer
    this.wheelSpin += (this.speed / 0.36) * dt;
    for (const w of this.built.wheels) {
      w.mesh.rotation.x = this.wheelSpin;
      if (w.steer) w.mesh.rotation.y = this.steer * 0.42;
    }
    // brake light flare
    return Math.abs(this.speed);
  }
  setHeadlights(on, intensity = 60) {
    for (const b of this.built.beams) b.intensity = on ? intensity : 0;
  }
}
