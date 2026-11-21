// SOLMAR v4 — boot, loop, state machine, camera, save/load, post chain.
// Third-person open world: Mara on foot / car / bike / boat, 5 missions,
// wanted 0-5, traffic + peds + police, HUD + rotating minimap + GPS.
import * as THREE from 'three';
import { makeRng, clamp, damp } from './rng.js';
import { setMaxAniso } from './textures.js';
import { createLighting, PRESETS } from './lighting.js';
import { createInput } from './input.js';
import { buildHuman } from './character.js';
import { buildCity, districtAt } from './city.js';
import { makeCar, makeBike, makeBoat, Driveable } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { PedManager } from './peds.js';
import { PoliceManager } from './police.js';
import { MissionManager, MISSIONS } from './missions.js';
import { Combat } from './combat.js';
import { Particles } from './particles.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { stageShot } from './shots.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

window.__shotReady = false;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const shotName = params.get('shot') || '';
const rng = makeRng(seed);

// ---- renderer: pixelRatio capped at 2, ACES, sRGB, soft shadows
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setMaxAniso(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(0, 30, 60);

const lighting = createLighting(scene, renderer);
const city = buildCity(scene, rng);
// mission spawn landmarks not in the city builder
city.landmarks.bikeSpawn = new THREE.Vector3(0, 0, 120);
city.landmarks.sportSpawn = new THREE.Vector3(20, 0, -60);
city.landmarks.beachEnd = new THREE.Vector3(120, 0, 140);

const input = createInput(canvas);
const hud = new HUD();
const audio = new AudioEngine();
const particles = new Particles(scene, rng);
const traffic = new TrafficManager(scene, rng, 10);
const peds = new PedManager(scene, rng, 16);
const police = new PoliceManager(scene, rng, city.colliders);

// ---- player: Mara Solis, ex-stunt driver
const mara = buildHuman({ female: true, height: 1.78, skin: 0xc98d64, shirt: 0xb02020, jacket: 0x8a1a1a, pants: 0x23283a, hair: 0x1a1210 });
scene.add(mara.group);
const player = {
  pos: new THREE.Vector3(0, 0, 20), heading: 0, vy: 0, grounded: true,
  health: 100, armor: 0, vehicle: null, human: mara, speed: 0, walkPhase: 0,
};
mara.group.position.copy(player.pos);

// ---- parked / mission vehicles
const parked = [];
function park(built, x, z, heading) {
  const d = new Driveable(built, new THREE.Vector3(x, 0, z), heading);
  scene.add(built.group);
  parked.push(d);
  return d;
}
const sportCar = park(makeCar(0xff6a1a, { sport: true }), 20, -60, Math.PI / 2);
const bike = park(makeBike(0xd82a2a), 0, 120, Math.PI);
const boat = park(makeBoat(0x2a6fd8), 44.5, 166, Math.PI);
park(makeCar(0x3a5a8a), -10, 18, 0);
park(makeCar(0xd8d8d8), 14, 42, Math.PI / 2);
park(makeCar(0x2a2a2a), -42, -18, Math.PI);
park(makeCar(0x8a6a2a, { taxi: true }), 42, 18, -Math.PI / 2);
park(makeCar(0x3a8a5a), -62, 42, 0);
park(makeBike(0x2a6fd8), -30, 80, Math.PI / 2);

// ---- combat + missions
const combat = new Combat(scene, rng, (e) => {
  if (e.type === 'gunshot') audio.gunshot();
  if (e.type === 'shotgun') audio.shotgunBlast();
});
let presetName = 'dawn';
function applyPreset(name) {
  presetName = name;
  const p = lighting.apply(name, player.pos);
  particles.setRain(!!p.rain);
  audio.setRain(!!p.rain);
  const wet = p.rain ? 1.0 : 0.55;
  city.asphaltMat.clearcoat = wet;
  city.asphaltMat.clearcoatRoughness = p.rain ? 0.06 : 0.22;
  const night = name === 'night' || name === 'dusk-rain';
  for (const d of parked) d.setHeadlights(night, 60);
  return p;
}
const policeCallbacks = {
  onDamage: (n) => damagePlayer(n),
  onRam: (n) => {
    if (player.vehicle) {
      player.vehicle.health -= n * 0.4;
      if (player.vehicle.health < 40) particles.smokePuff(player.vehicle.pos.clone().setY(1.2), 2);
      if (player.vehicle.health <= 0) wreckVehicle();
    } else damagePlayer(n);
  },
  onCopShot: (from) => {
    combat.spawnTracer(from.clone().setY(1.4), player.pos.clone().setY(1.3));
  },
  onSpike: () => {
    if (player.vehicle) {
      player.vehicle.speed = 2; player.vehicle.health -= 30;
      particles.burst(player.vehicle.pos.clone().setY(0.6), 0xcccccc, 18, 6);
      hud.toast('SPIKE STRIP — tires blown!');
    }
  },
  isNight: () => presetName === 'night' || presetName === 'dusk-rain',
};
const missions = new MissionManager(scene, city.landmarks, (e) => {
  if (e.type === 'mission-start') {
    applyPreset(e.mission.preset);
    hud.toast(`MISSION ${missions.index + 1}: ${e.mission.name} — $${e.mission.reward}`);
  } else if (e.type === 'mission-complete') {
    audio.sting();
    hud.toast(`MISSION COMPLETE — +$${e.mission.reward}`);
    saveGame();
  } else if (e.type === 'game-complete') {
    hud.show('endScreen');
    state = 'complete';
  } else if (e.type === 'set-wanted') {
    police.setWanted(e.wanted, time);
  } else if (e.type === 'cash-grab') {
    audio.chime();
    hud.toast(`Cash grabbed ${e.count}/3`);
  } else if (e.type === 'package') {
    audio.chime();
    hud.toast(`Hidden package ${e.count}/10 — +$250`);
  } else if (e.type === 'roadblock') {
    police.spawnRoadblockAhead(player.pos, player.heading);
  } else if (e.type === 'taxi-start') {
    hud.toast(`Taxi fare — pick up the passenger ($${e.taxi.fare})`);
  } else if (e.type === 'timer-fail') {
    hud.toast('Timer expired — try again');
  }
});

// ---- post chain: SSAO + bloom (threshold 0.9) + FXAA + vignette + output
let composer = null, fxaaPass = null;
try {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const ssao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssao.kernelRadius = 8; ssao.minDistance = 0.005; ssao.maxDistance = 0.12;
  composer.addPass(ssao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.35, 0.9);
  composer.addPass(bloom);
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * renderer.getPixelRatio()), 1 / (window.innerHeight * renderer.getPixelRatio()));
  composer.addPass(fxaaPass);
  const vig = new ShaderPass(VignetteShader);
  vig.uniforms.offset.value = 0.95; vig.uniforms.darkness.value = 0.42;
  composer.addPass(vig);
  composer.addPass(new OutputPass());
} catch (e) {
  console.warn('post chain failed, direct render', e);
  composer = null;
}
let composerBroken = false;

// ---- state, save/load
let state = 'menu';
let time = 0, frames = 0, camYaw = 0, camPitch = 0.32, camDist = 6.5;
let staged = false;
function saveGame() {
  try {
    localStorage.setItem('solmar-v4-save', JSON.stringify({
      money: missions.money, mission: missions.index, packages: missions.packages,
      x: player.pos.x, z: player.pos.z, preset: presetName,
    }));
  } catch (e) { /* storage unavailable */ }
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem('solmar-v4-save') || 'null');
    if (!s) return false;
    missions.money = s.money; missions.packages = s.packages || 0;
    player.pos.set(s.x || 0, 0, s.z || 20);
    return true;
  } catch (e) { return false; }
}
function damagePlayer(n) {
  const absorbed = Math.min(player.armor, n * 0.6);
  player.armor -= absorbed;
  player.health -= (n - absorbed);
  hud.damageFlash(n);
  if (player.health <= 0) {
    player.health = 0;
    state = 'busted';
    hud.show('bustedScreen');
    police.clear();
  }
}
function wreckVehicle() {
  if (!player.vehicle) return;
  particles.burst(player.vehicle.pos.clone().setY(1), 0xff7a20, 40, 12);
  audio.shotgunBlast();
  const v = player.vehicle;
  parked.splice(parked.indexOf(v), 1);
  scene.remove(v.group);
  exitVehicle(true);
  damagePlayer(20);
  hud.toast('Vehicle destroyed!');
}
function enterVehicle(d, silent = false) {
  exitVehicle(true);
  player.vehicle = d;
  // Mara stays visible, seated on/in the vehicle (drive pose, seat offset)
  player.human.setPose('drive', 0);
  d.setHeadlights(presetName === 'night' || presetName === 'dusk-rain', 60);
  if (!silent) {
    police.addCrime(1, time);
    hud.toast(d === boat ? 'Boat stolen — wanted +1' : 'Vehicle stolen — wanted +1');
  }
}
function exitVehicle(silent = false) {
  if (!player.vehicle) return;
  const v = player.vehicle;
  v.speed = 0;
  player.pos.set(v.pos.x + Math.sin(v.heading + Math.PI / 2) * 2.2, 0, v.pos.z + Math.cos(v.heading + Math.PI / 2) * 2.2);
  player.heading = v.heading;
  player.vehicle = null;
  mara.group.visible = true;
  mara.group.position.copy(player.pos);
  void silent;
}
function nearestVehicle(maxD = 4.5) {
  let best = null, bd = maxD;
  for (const d of parked) {
    const dist = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z);
    if (dist < bd) { bd = dist; best = d; }
  }
  return best;
}

// ---- UI wiring
const $ = (id) => document.getElementById(id);
$('startBtn').addEventListener('click', () => {
  audio.ensure(); hud.hide('startScreen'); state = 'playing';
  missions.startMission(0);
});
$('continueBtn').addEventListener('click', () => {
  audio.ensure();
  if (loadGame()) { missions.startMission(missions.index); hud.toast('Save loaded'); }
  else missions.startMission(0);
  hud.hide('startScreen'); state = 'playing';
});
$('resumeBtn').addEventListener('click', () => { hud.hide('pauseScreen'); state = 'playing'; });
$('restartBtn').addEventListener('click', () => {
  hud.hide('pauseScreen'); missions.startMission(missions.index); state = 'playing';
});
$('quitBtn').addEventListener('click', () => { saveGame(); hud.hide('pauseScreen'); hud.show('startScreen'); state = 'menu'; });
$('respawnBtn').addEventListener('click', () => {
  hud.hide('bustedScreen');
  player.health = 100; player.armor = 0;
  missions.money = Math.max(0, missions.money - 100);
  player.pos.copy(city.landmarks.hospital).add(new THREE.Vector3(0, 0, 8));
  exitVehicle(true);
  state = 'playing';
});
$('againBtn').addEventListener('click', () => {
  hud.hide('endScreen');
  missions.index = 0; missions.money = 200;
  missions.startMission(0); state = 'playing';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'playing') { state = 'paused'; hud.show('pauseScreen'); }
    else if (state === 'paused') { state = 'playing'; hud.hide('pauseScreen'); }
  }
  if (e.code === 'KeyM') { audio.musicOn = !audio.musicOn; }
  if (e.code === 'KeyC') { hud.toast(`Radio: ${audio.nextStation()}`); }
  if (e.code === 'KeyN' && state === 'playing') {
    missions.startMission(Math.min(MISSIONS.length - 1, missions.index + 1));
  }
});

// ---- staging (screenshots)
const world = {
  city, police, missions, particles, hud, player, camera, combat, peds, traffic,
  bike, boat, sportCar, time: 0, staged: false, shotName: '',
  applyPreset, enterVehicle, exitVehicle, policeCallbacks,
};
if (shotName) {
  hud.hide('startScreen');
  state = 'playing';
  applyPreset('noon');
  staged = stageShot(shotName, world);
  world.staged = staged;
} else {
  applyPreset('dawn');
  missions.startMission(0);
}

// ---- per-frame update
const clock = new THREE.Clock();
const sunOffset = new THREE.Vector3();
function resolveAABB(pos, radius) {
  for (const c of city.colliders) {
    if (pos.x > c.minX - radius && pos.x < c.maxX + radius && pos.z > c.minZ - radius && pos.z < c.maxZ + radius) {
      const dxl = pos.x - (c.minX - radius), dxr = (c.maxX + radius) - pos.x;
      const dzl = pos.z - (c.minZ - radius), dzr = (c.maxZ + radius) - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.minX - radius;
      else if (m === dxr) pos.x = c.maxX + radius;
      else if (m === dzl) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
}
function updatePlayer(dt) {
  const { f, s } = input.axis();
  if (player.vehicle) {
    const v = player.vehicle;
    const handbrake = input.pressed('Space');
    v.update(dt, { f, s, handbrake }, city.colliders, v.kind === 'boat');
    player.pos.copy(v.pos);
    player.heading = v.heading;
    player.speed = Math.abs(v.speed);
    // seat Mara on the vehicle: local offset rotated by the vehicle quaternion
    const seat = v.kind === 'bike' ? { off: new THREE.Vector3(-0.32, 0, 0), rootY: -0.10 }
      : v.kind === 'boat' ? { off: new THREE.Vector3(0.5, 0, 0), rootY: -0.05 }
      : { off: new THREE.Vector3(0.2, 0, -0.4), rootY: -0.10 };
    mara.group.position.copy(v.pos).add(seat.off.clone().applyQuaternion(v.group.quaternion));
    mara.group.position.y = v.pos.y + seat.rootY;
    mara.group.rotation.y = v.heading;
    mara.setPose('drive', time);
    if (v.kind === 'boat') particles.wakeAt(new THREE.Vector3(v.pos.x - Math.sin(v.heading) * 2.6, 0, v.pos.z - Math.cos(v.heading) * 2.6), player.speed);
    audio.setEngine(player.speed / 40, true);
    if (input.pressed('KeyE') && !updatePlayer._eLock) { updatePlayer._eLock = true; exitVehicle(); }
    if (!input.pressed('KeyE')) updatePlayer._eLock = false;
    return;
  }
  audio.setEngine(0, false);
  // on foot
  const run = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
  const speed = run ? 7.5 : 4.2;
  const moveX = Math.sin(camYaw) * f + Math.cos(camYaw) * s;
  const moveZ = Math.cos(camYaw) * f - Math.sin(camYaw) * s;
  const moving = (f !== 0 || s !== 0);
  if (moving) {
    const len = Math.hypot(moveX, moveZ) || 1;
    player.pos.x += (moveX / len) * speed * dt;
    player.pos.z += (moveZ / len) * speed * dt;
    player.heading = Math.atan2(moveX, moveZ);
    player.walkPhase += dt * (run ? 11 : 7);
    player.speed = speed;
    mara.setPose(run ? 'run' : 'walk', player.walkPhase);
  } else {
    player.speed = 0;
    mara.setPose(combat.weapon !== 'fists' ? 'aim' : 'idle', time);
  }
  // jump
  if (input.pressed('Space') && player.grounded) { player.vy = 7.5; player.grounded = false; }
  if (!player.grounded) {
    player.vy -= 22 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.grounded = true; }
  }
  resolveAABB(player.pos, 0.5);
  player.pos.x = clamp(player.pos.x, -158, 158);
  player.pos.z = clamp(player.pos.z, -158, 152);
  mara.group.position.copy(player.pos);
  mara.group.position.y = player.pos.y;
  mara.group.rotation.y = player.heading;
  if (input.pressed('KeyE') && !updatePlayer._eLock) {
    updatePlayer._eLock = true;
    const d = nearestVehicle();
    if (d) enterVehicle(d);
  }
  if (!input.pressed('KeyE')) updatePlayer._eLock = false;
  // weapons
  if (input.pressed('Digit1')) combat.setWeapon('fists');
  if (input.pressed('Digit2')) combat.setWeapon('pistol');
  if (input.pressed('Digit3')) combat.setWeapon('shotgun');
  if (input.pressed('KeyR')) combat.reload();
  if (input.pressed('KeyF')) combat.fire(player.pos, player.heading, combatTargets(), onCombatHit);
  if (input.consumeClick()) {
    if (combat.weapon !== 'fists') {
      combat.fire(player.pos, player.heading, combatTargets(), onCombatHit);
      peds.scare(player.pos.x, player.pos.z, 16);
      police.addCrime(1, time);
    } else {
      combat.fire(player.pos, player.heading, combatTargets(), onCombatHit);
    }
  }
  if (input.pressed('KeyT')) {
    let near = null, bd = 7;
    for (const p of peds.peds) {
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if (d < bd) { bd = d; near = p.pos; }
    }
    if (near) missions.startTaxi({ nearPed: near, playerPos: player.pos });
  }
}
function combatTargets() {
  const list = [];
  for (const c of police.cops) list.push({ pos: c.pos, kind: 'cop', ref: c });
  for (const p of peds.peds) list.push({ pos: p.pos, kind: 'ped', ref: p });
  return list;
}
let crimeLock = false;
function onCombatHit(t, dmg, dir) {
  if (t.kind === 'cop') {
    t.ref.health -= dmg;
    t.ref.pos.x += dir.x * 0.6; t.ref.pos.z += dir.z * 0.6;
    if (t.ref.health <= 0) {
      const i = police.cops.indexOf(t.ref);
      if (i >= 0) { scene.remove(t.ref.human.group); police.cops.splice(i, 1); }
      police.addCrime(2, time);
    }
  } else {
    peds.scare(t.pos.x, t.pos.z, 10);
    if (!crimeLock) { crimeLock = true; police.addCrime(1, time); setTimeout(() => { crimeLock = false; }, 3000); }
  }
}
function updateCamera(dt) {
  const { dx, dy } = input.consumeMouse();
  camYaw -= dx * 0.004;
  camPitch = clamp(camPitch + dy * 0.003, -0.1, 1.1);
  camDist = clamp(camDist + input.consumeWheel() * 0.005, 4, 12);
  if (staged) return; // shots set the camera directly
  if (player.vehicle) {
    const v = player.vehicle;
    const back = new THREE.Vector3(
      v.pos.x - Math.sin(v.heading) * 7.2, 2.7, v.pos.z - Math.cos(v.heading) * 7.2);
    camera.position.x = damp(camera.position.x, back.x, 5, dt);
    camera.position.y = damp(camera.position.y, back.y, 5, dt);
    camera.position.z = damp(camera.position.z, back.z, 5, dt);
    camera.lookAt(v.pos.x + Math.sin(v.heading) * 8, 1.3, v.pos.z + Math.cos(v.heading) * 8);
    const targetFov = 55 + clamp(player.speed / 40, 0, 1) * 9;
    camera.fov = damp(camera.fov, targetFov, 4, dt);
    camera.updateProjectionMatrix();
  } else {
    const px = player.pos.x, py = player.pos.y + 1.6, pz = player.pos.z;
    const cx = px - Math.sin(camYaw) * Math.cos(camPitch) * camDist;
    const cy = py + Math.sin(camPitch) * camDist;
    const cz = pz - Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    camera.position.set(cx, Math.max(0.6, cy), cz);
    camera.lookAt(px, py, pz);
    camera.fov = damp(camera.fov, 55, 4, dt);
    camera.updateProjectionMatrix();
  }
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt; frames++;
  world.time = time;
  const playing = state === 'playing';
  if (playing || state === 'menu') {
    if (playing) updatePlayer(dt);
    traffic.update(dt, player.pos);
    peds.update(dt, player.pos, player.speed);
    if (playing) {
      police.update(dt, time, player, policeCallbacks);
      missions.update(dt, {
        playerPos: player.pos,
        inVehicle: !!player.vehicle,
        vehicleKind: player.vehicle ? player.vehicle.kind : null,
        inSportCar: player.vehicle === sportCar,
      });
      combat.update(dt, player.pos, (kind) => {
        if (kind === 'health') player.health = Math.min(100, player.health + 30);
        if (kind === 'armor') player.armor = Math.min(100, player.armor + 50);
        if (kind === 'ammo') { combat.ammo.pistol = 12; combat.ammo.shotgun = 6; }
        audio.chime();
      });
      // slow health regen
      player.health = Math.min(100, player.health + dt * 1.2);
    }
    city.update(dt, time);
    particles.update(dt);
    if (presetName === 'dusk-rain') particles.updateRain(dt, player.pos);
    audio.setSiren(police.wanted > 0 && playing, time);
    audio.updateMusic(dt);
    // sun follows the player (tight shadow frustum, no shimmer)
    const p = PRESETS[presetName];
    sunOffset.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);
    lighting.sun.position.set(player.pos.x + sunOffset.x, sunOffset.y, player.pos.z + sunOffset.z);
    lighting.sun.target.position.copy(player.pos);
    if (!staged) hud.showDistrict(districtAt(player.pos.x, player.pos.z));
  }
  updateCamera(dt);
  // HUD + minimap
  const m = missions.mission;
  hud.update(dt, {
    missionTitle: m ? `MISSION ${missions.index + 1}: ${m.name} — $${m.reward}` : 'SOLMAR LEGEND',
    objective: missions.objectiveText + (missions.distance > 0 ? ` — ${Math.round(missions.distance)}m` : ''),
    timer: missions.timer,
    wanted: police.wanted,
    money: missions.money,
    clockLabel: PRESETS[presetName].label,
    clock: PRESETS[presetName].clock,
    packages: missions.packages,
    health: player.health, armor: player.armor,
    weaponLabel: combat.weapon === 'fists' ? 'FISTS —' : `${combat.weapon.toUpperCase()} ${combat.ammo[combat.weapon]}`,
    speedMph: player.speed * 2.237,
    radioOn: audio.musicOn, station: audio.stations[audio.station],
    inVehicle: !!player.vehicle,
  });
  if (frames % 2 === 0) {
    const blips = police.blips();
    hud.drawMinimap({
      playerX: player.pos.x, playerZ: player.pos.z,
      heading: player.vehicle ? player.vehicle.heading : camYaw,
      route: missions.route,
      target: missions.targetPos(),
      cops: blips.cops, cars: blips.cars, heli: blips.heli, boats: blips.boats,
      traffic: traffic.positions(),
      packages: missions.packageSpots.filter((pk) => !pk.got).map((pk) => ({ x: pk.pos.x, z: pk.pos.z })),
    });
  }
  // render
  if (composer && !composerBroken) {
    try { composer.render(); } catch (e) { composerBroken = true; console.warn('composer failed, direct render', e); renderer.render(scene, camera); }
  } else {
    renderer.render(scene, camera);
  }
  if (staged && frames >= 5 && !window.__shotReady) window.__shotReady = true;
  if (!staged && frames === 5 && !shotName) window.__shotReady = true;
}
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  if (fxaaPass) fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * renderer.getPixelRatio()), 1 / (window.innerHeight * renderer.getPixelRatio()));
});
window.__game = { player, missions, police, city, traffic, peds, combat, parked, sportCar, bike, boat };
animate();
