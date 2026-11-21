// SOLMAR v4 — human builder. Lathe tapered limbs + Capsule joints + a real
// extruded hand (palm + 4 tapered fingers + thumb, bevel 0.005) + fabric sheen.
// Proportions ~1.78 m, real neck, natural joint pivots. No mitten hands.
import * as THREE from 'three';
import { fabricMat, phys, rbox, smoothGeo } from './textures.js';

function latheLimb(profile, mat, radial = 14) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = smoothGeo(new THREE.LatheGeometry(pts, radial));
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
// limb segment pivoted at its TOP joint: geometry hangs downward from y=0.
function limbSegment(len, rTop, rMid, rBot, mat) {
  const prof = [
    [0.001, 0], [rBot, 0.01], [rMid, len * 0.55], [rTop * 0.92, len * 0.92], [rTop, len],
  ];
  const mesh = latheLimb(prof, mat);
  mesh.geometry.translate(0, -len, 0); // top joint at local origin
  return mesh;
}
function jointCapsule(r, mat) {
  const m = new THREE.Mesh(smoothGeo(new THREE.CapsuleGeometry(r, r * 0.6, 6, 12)), mat);
  m.castShadow = true;
  return m;
}
// Extruded hand silhouette: palm + 4 tapered fingers + thumb, bevel 0.005.
export function makeHand(skinMat) {
  const s = new THREE.Shape();
  const W = 0.085, palmH = 0.085;
  s.moveTo(-W / 2, 0);
  s.lineTo(-W / 2, palmH * 0.7);
  // four tapered fingers
  const fw = W / 4;
  for (let i = 0; i < 4; i++) {
    const x0 = -W / 2 + i * fw;
    const fl = [0.075, 0.085, 0.08, 0.065][i];
    s.lineTo(x0 + fw * 0.12, palmH + fl * 0.55);
    s.lineTo(x0 + fw * 0.5, palmH + fl);
    s.lineTo(x0 + fw * 0.88, palmH + fl * 0.55);
    s.lineTo(x0 + fw, palmH * 0.7);
  }
  s.lineTo(W / 2, palmH * 0.35);
  // thumb on the side
  s.lineTo(W / 2 + 0.028, palmH * 0.42);
  s.lineTo(W / 2 + 0.024, palmH * 0.18);
  s.lineTo(W / 2, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 3, curveSegments: 6,
  });
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, skinMat);
  m.castShadow = true;
  return m;
}

export function buildHuman(opts = {}) {
  const {
    height = 1.78, skin = 0xc98d64, shirt = 0xb02020, pants = 0x23283a,
    hair = 0x1a1210, jacket = null, female = false, cap = null,
  } = opts;
  const k = height / 1.78; // scale factor
  const skinMat = phys({ color: skin, roughness: 0.55, metalness: 0.0, sheen: 0.4, sheenColor: 0x664433, sheenRoughness: 0.6 });
  const shirtMat = fabricMat(shirt);
  const jacketMat = jacket ? fabricMat(jacket, 0x333333) : shirtMat;
  const pantsMat = fabricMat(pants, 0x222222);
  const shoeMat = phys({ color: 0x14100e, roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3 });

  const root = new THREE.Group();
  const parts = {};

  // ---- hips / pelvis (rounded, not a box)
  const hips = new THREE.Group(); hips.position.y = 0.98 * k; root.add(hips);
  const pelvis = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.155 * k, 16, 12)), pantsMat);
  pelvis.scale.set(1.25, 0.72, 0.85); pelvis.castShadow = true; hips.add(pelvis);
  parts.hips = hips;

  // ---- torso: lathe taper — narrow waist, wider chest, jacket shell over it
  const torso = new THREE.Group(); torso.position.y = 0.98 * k; root.add(torso);
  const torsoMesh = latheLimb([
    [0.001, 0], [0.145, 0.01], [0.128, 0.12], [0.135, 0.26], [0.165, 0.42], [0.175, 0.5], [0.001, 0.52],
  ], jacketMat, 18);
  torsoMesh.position.y = 0; torso.add(torsoMesh);
  // shirt V + belt
  const belt = new THREE.Mesh(rbox(0.30 * k, 0.045 * k, 0.19 * k, 0.015, 4), phys({ color: 0x2a1c10, roughness: 0.4, clearcoat: 0.4 }));
  belt.position.y = 0.02 * k; torso.add(belt);
  const collar = new THREE.Mesh(smoothGeo(new THREE.TorusGeometry(0.085 * k, 0.018 * k, 8, 16)), jacketMat);
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.50 * k; torso.add(collar);
  parts.torso = torso;

  // ---- neck + head
  const neck = new THREE.Group(); neck.position.y = 1.50 * k; root.add(neck);
  const neckMesh = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.05 * k, 0.058 * k, 0.09 * k, 12)), skinMat);
  neckMesh.position.y = 0.03 * k; neckMesh.castShadow = true; neck.add(neckMesh);
  const head = new THREE.Group(); head.position.y = 1.58 * k; root.add(head);
  const skull = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.105 * k, 20, 16)), skinMat);
  skull.scale.set(0.92, 1.12, 0.98); skull.position.y = 0.06 * k; skull.castShadow = true; head.add(skull);
  // hair: cap shell swept back + bun/ponytail
  const hairMat = phys({ color: hair, roughness: 0.85, sheen: 0.5, sheenColor: 0x222222, sheenRoughness: 0.7 });
  const hairCap = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.108 * k, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58)), hairMat);
  hairCap.scale.set(0.95, 1.12, 1.0); hairCap.position.set(0, 0.075 * k, -0.008 * k); hairCap.castShadow = true; head.add(hairCap);
  if (female) {
    const bun = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.05 * k, 12, 10)), hairMat);
    bun.position.set(0, 0.10 * k, -0.105 * k); head.add(bun);
    const tail = new THREE.Mesh(smoothGeo(new THREE.CapsuleGeometry(0.028 * k, 0.16 * k, 4, 10)), hairMat);
    tail.position.set(0, -0.02 * k, -0.125 * k); tail.rotation.x = 0.35; head.add(tail);
  }
  // eyes
  const eyeMat = phys({ color: 0x14100c, roughness: 0.25 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.011 * k, 8, 8)), eyeMat);
    eye.position.set(sx * 0.038 * k, 0.065 * k, 0.092 * k); head.add(eye);
  }
  if (cap) {
    const capMesh = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.112 * k, 0.112 * k, 0.035 * k, 16, 1, false, 0, Math.PI * 2)), fabricMat(cap));
    capMesh.position.y = 0.155 * k; head.add(capMesh);
    const brim = new THREE.Mesh(rbox(0.14 * k, 0.012 * k, 0.09 * k, 0.005, 3), fabricMat(cap));
    brim.position.set(0, 0.145 * k, 0.12 * k); head.add(brim);
  }
  parts.head = head; parts.neck = neck;

  // ---- arms: shoulder capsule + lathe upper/forearm + hand, pivoted joints
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.20 * k, 1.46 * k, 0);
    root.add(shoulder);
    const capJ = jointCapsule(0.062 * k, jacketMat); shoulder.add(capJ);
    const upper = limbSegment(0.30 * k, 0.058 * k, 0.052 * k, 0.048 * k, jacketMat);
    shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.30 * k; shoulder.add(elbow);
    elbow.add(jointCapsule(0.048 * k, skinMat));
    const fore = limbSegment(0.28 * k, 0.048 * k, 0.042 * k, 0.038 * k, skinMat);
    elbow.add(fore);
    const wrist = new THREE.Group(); wrist.position.y = -0.28 * k; elbow.add(wrist);
    const hand = makeHand(skinMat);
    hand.scale.setScalar(k); hand.rotation.x = Math.PI; // fingers point down
    hand.position.set(-0.042 * k, -0.01 * k, 0.012 * k);
    wrist.add(hand);
    return { shoulder, elbow, wrist, hand };
  }
  parts.armL = makeArm(-1); parts.armR = makeArm(1);

  // ---- legs: hip capsule + lathe thigh/shin + rounded shoe
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09 * k, 0.96 * k, 0);
    root.add(hip);
    hip.add(jointCapsule(0.075 * k, pantsMat));
    const thigh = limbSegment(0.46 * k, 0.085 * k, 0.07 * k, 0.06 * k, pantsMat);
    hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.46 * k; hip.add(knee);
    knee.add(jointCapsule(0.06 * k, pantsMat));
    const shin = limbSegment(0.44 * k, 0.06 * k, 0.05 * k, 0.042 * k, pantsMat);
    knee.add(shin);
    const ankle = new THREE.Group(); ankle.position.y = -0.44 * k; knee.add(ankle);
    const shoe = new THREE.Mesh(rbox(0.10 * k, 0.07 * k, 0.26 * k, 0.025, 4), shoeMat);
    shoe.position.set(0, -0.035 * k, 0.05 * k); shoe.castShadow = true; ankle.add(shoe);
    return { hip, knee, ankle, shoe };
  }
  parts.legL = makeLeg(-1); parts.legR = makeLeg(1);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // ---- poses
  function setPose(pose, phase = 0, amt = 1) {
    const s = Math.sin(phase), c = Math.cos(phase);
    // reset
    parts.armL.shoulder.rotation.set(0, 0, 0.10);
    parts.armR.shoulder.rotation.set(0, 0, -0.10);
    parts.armL.elbow.rotation.x = -0.25; parts.armR.elbow.rotation.x = -0.25;
    parts.legL.hip.rotation.x = 0; parts.legR.hip.rotation.x = 0;
    parts.legL.knee.rotation.x = 0; parts.legR.knee.rotation.x = 0;
    torso.rotation.x = 0; torso.rotation.y = 0;
    hips.position.y = 0.98 * k;
    if (pose === 'walk' || pose === 'run') {
      const sw = pose === 'run' ? 0.85 : 0.5;
      parts.legL.hip.rotation.x = s * sw * amt;
      parts.legR.hip.rotation.x = -s * sw * amt;
      parts.legL.knee.rotation.x = Math.max(0, -c) * (pose === 'run' ? 1.1 : 0.6) * amt;
      parts.legR.knee.rotation.x = Math.max(0, c) * (pose === 'run' ? 1.1 : 0.6) * amt;
      parts.armL.shoulder.rotation.x = -s * sw * 0.8 * amt;
      parts.armR.shoulder.rotation.x = s * sw * 0.8 * amt;
      parts.armL.elbow.rotation.x = -0.5 * amt; parts.armR.elbow.rotation.x = -0.5 * amt;
      torso.rotation.x = pose === 'run' ? 0.12 : 0.05;
      hips.position.y = 0.98 * k + Math.abs(c) * 0.02 * k;
    } else if (pose === 'aim') {
      parts.armR.shoulder.rotation.x = -Math.PI / 2 + 0.08;
      parts.armR.elbow.rotation.x = -0.06;
      parts.armL.shoulder.rotation.x = -Math.PI / 2 + 0.25;
      parts.armL.shoulder.rotation.y = 0.5;
      parts.armL.elbow.rotation.x = -0.9;
      torso.rotation.y = -0.18;
    } else if (pose === 'drive') {
      parts.legL.hip.rotation.x = -1.35; parts.legR.hip.rotation.x = -1.35;
      parts.legL.knee.rotation.x = 1.5; parts.legR.knee.rotation.x = 1.5;
      parts.armL.shoulder.rotation.x = -0.85; parts.armR.shoulder.rotation.x = -0.85;
      parts.armL.elbow.rotation.x = -0.35; parts.armR.elbow.rotation.x = -0.35;
      torso.rotation.x = 0.08;
    } else if (pose === 'sit') {
      parts.legL.hip.rotation.x = -1.5; parts.legR.hip.rotation.x = -1.5;
      parts.legL.knee.rotation.x = 1.6; parts.legR.knee.rotation.x = 1.6;
      parts.armL.shoulder.rotation.x = -0.5; parts.armR.shoulder.rotation.x = -0.5;
    }
    // idle breathing
    if (pose === 'idle') torso.scale.y = 1 + Math.sin(phase * 0.5) * 0.008;
  }
  root.userData.human = { parts, setPose, height };
  return { group: root, parts, setPose };
}
