// SOLMAR v4 — deterministic ?shot=<name>&seed=7 staging. Each shot positions
// the player/vehicles/police/camera, sets the mission + wanted level, and
// flips window.__shotReady once the frame is composed.
import * as THREE from 'three';
import { gpsRoute } from './missions.js';

function lookAt(cam, from, to) {
  cam.position.copy(from);
  cam.lookAt(to.x, to.y, to.z);
}

export function stageShot(name, w) {
  const { police, missions, particles, hud, player, camera } = w;
  w.staged = true;
  const set = (preset, missionIdx, wanted) => {
    w.applyPreset(preset);
    missions.startMission(missionIdx);
    police.setWanted(wanted, w.time);
    if (wanted >= 4) police.update(0.01, w.time, player, w.policeCallbacks);
  };
  if (name === 'dawn') {
    // Shot 1 — dawn, low 3/4 behind the bike ON the east road (z=-40),
    // Mara riding toward the suspension bridge, skyline ahead, GPS route
    // to mission 1 pinned on the minimap, 0 stars.
    set('dawn', 0, 0);
    w.enterVehicle(w.bike, true);
    w.bike.pos.set(60, 0, -40); w.bike.heading = Math.PI / 2; w.bike.speed = 0;
    w.bike.group.position.copy(w.bike.pos);
    w.bike.group.rotation.y = w.bike.heading - Math.PI / 2;
    player.human.setPose('drive', 0);
    missions.pinTarget = w.city.landmarks.garage;
    missions.route = gpsRoute(w.bike.pos, w.city.landmarks.garage);
    lookAt(camera,
      new THREE.Vector3(60 - 8.2, 2.9, -40 + 3.4),
      new THREE.Vector3(60 + 16, 1.1, -40 - 1.5));
    // helicopter idle on the helipad
    police.heli.group.visible = true;
    police.heli.group.position.copy(w.city.landmarks.helipad).add(new THREE.Vector3(0, 1.2, 0));
    police.heli.group.userData.cone.visible = false;
    police.heli.group.userData.spot.intensity = 0;
    hud.toast('MISSION 1 — steal any car');
  } else if (name === 'heist') {
    // Shot 2 — noon, over-the-shoulder at the bank plaza: pistol drawn,
    // cash grab in progress, 3 stars, civilians scattering, police converging.
    set('noon', 2, 3);
    missions.bankCash = 1;
    w.exitVehicle(true);
    player.pos.set(30, 0, -12); player.heading = Math.PI;
    player.human.group.position.copy(player.pos);
    player.human.setPose('aim', 0);
    w.combat.setWeapon('pistol');
    w.peds.scare(30, -12, 26);
    lookAt(camera,
      new THREE.Vector3(30 + 4.0, 4.0, -12 + 11.0),
      new THREE.Vector3(30, 5.2, -30));
    hud.toast('MISSION 3 — grab the cash');
  } else if (name === 'storm') {
    // Shot 3 — dusk rain, low chase cam behind the sports car drifting a wet
    // boulevard: 4 stars, police sedan ramming, helicopter searchlight,
    // spike strip ahead, hydrant debris.
    set('dusk-rain', 3, 4);
    missions.step = 1; missions.timer = 45; // survive phase
    w.enterVehicle(w.sportCar, true);
    w.sportCar.pos.set(0, 0, 44); w.sportCar.heading = Math.PI; w.sportCar.speed = 11;
    w.sportCar.group.position.copy(w.sportCar.pos);
    w.sportCar.group.rotation.y = w.sportCar.heading - Math.PI / 2;
    police.spawnRoadblockAhead(new THREE.Vector3(0, 0, 44), Math.PI);
    // police sedan right behind, ramming
    if (police.cars[0]) {
      police.cars[0].pos.set(4.5, 0, 52); police.cars[0].heading = Math.PI; police.cars[0].speed = 12;
    }
    particles.burst(new THREE.Vector3(6, 1, 30), 0x9fd8e8, 30, 8); // hydrant spray
    particles.setRain(true);
    lookAt(camera,
      new THREE.Vector3(0 + 1.5, 2.4, 44 + 8.5),
      new THREE.Vector3(0, 1.0, 44 - 16));
    hud.toast('MISSION 4 — survive the chase — 45s');
  } else if (name === 'night') {
    // Shot 4 — night marina, wide tilt: Mara boarding the speedboat at a
    // neon-lit marina, 5 stars, police boats + helicopter, city lights on water.
    set('night', 4, 5);
    w.exitVehicle(true);
    // Mara on the dock LEFT of the boat (clear of the centre banner),
    // facing the boat — big enough to read as a person.
    player.pos.set(38.5, 0, 159); player.heading = 0.8;
    player.human.group.position.copy(player.pos);
    player.human.setPose('idle', 0.5);
    // boat right at the dock edge, bow out to sea
    w.boat.pos.set(44.5, 0, 166); w.boat.heading = 0; w.boat.speed = 0;
    w.boat.group.position.set(44.5, -0.1, 166);
    w.boat.group.rotation.y = w.boat.heading - Math.PI / 2;
    // hide the giant beacon pillar for this shot (it filled the frame)
    missions.beaconEnabled = false;
    missions.beacon.visible = false;
    police.update(0.01, w.time, player, w.policeCallbacks);
    lookAt(camera,
      new THREE.Vector3(34, 4.2, 150),
      new THREE.Vector3(43, 1.2, 164));
    hud.setCenter('<div style="background:rgba(0,0,0,0.65);padding:10px 18px;border-radius:8px;color:#ffd76a;font-weight:bold">MISSION COMPLETE — +$3000 · SOLMAR LEGEND</div>');
  } else {
    w.staged = false;
    return false;
  }
  w.shotName = name;
  return true;
}
