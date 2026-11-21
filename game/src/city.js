// SOLMAR v4 — city: 16x16 blocks, 4 districts + landmarks. RoundedBox
// everywhere, beveled ExtrudeGeometry reveals + interior boxes behind glass
// on hero facades, podium+tower massing, 1024px facade atlases.
import * as THREE from 'three';
import {
  rbox, bevelExtrude, rectShape, phys, paintMat, fabricMat, glassMat, lensMat,
  asphaltSet, concreteSet, woodSet, waterNormal, facadeSet, signTexture, smoothGeo,
} from './textures.js';
import { makeBoat } from './vehicles.js';

export const CITY = { half: 160, block: 20, roadW: 9 };

export function districtAt(x, z) {
  if (z > 70) return 'Marina & Beach';
  if (x < -70 && z < -70) return 'Hill Park';
  if (x > 0 && z < -20) return 'Downtown';
  if (x > 70) return 'Port & Industrial';
  if (x < -60) return 'Old Town';
  return 'Downtown';
}

function palmTree(rng, mats) {
  const g = new THREE.Group();
  const trunkMat = phys({ color: 0x6a4a2e, roughness: 0.95 });
  let x = 0, z = 0, y = 0;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.14 - i * 0.015, 0.17 - i * 0.015, 1.1, 10)), trunkMat);
    seg.position.set(x, y + 0.55, z); seg.rotation.z = 0.05 * i; seg.castShadow = true;
    g.add(seg); x += 0.09; y += 1.05;
  }
  const top = new THREE.Group(); top.position.set(x, y, z); g.add(top);
  const frondGeo = new THREE.PlaneGeometry(0.5, 2.2, 1, 8);
  const pos = frondGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const t = (py + 1.1) / 2.2;
    pos.setZ(i, -t * t * 1.1); // droop curve
    pos.setX(i, pos.getX(i) * (1 - t * 0.75)); // taper to tip
  }
  frondGeo.computeVertexNormals();
  const frondMat = phys({ color: 0x2e7d32, roughness: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 11; i++) {
    const f = new THREE.Mesh(frondGeo, frondMat);
    f.rotation.y = (i / 11) * Math.PI * 2 + rng.next();
    f.rotation.x = -0.5 - rng.range(0, 0.35);
    f.position.y = 0.15;
    f.castShadow = true;
    top.add(f);
  }
  const nuts = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.12, 8, 8)), phys({ color: 0x7a5a20, roughness: 0.9 }));
  nuts.position.y = -0.05; top.add(nuts);
  return g;
}

function lampPost(mats, tall = 5.2) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(rbox(0.14, tall, 0.14, 0.05, 4), mats.metalDark);
  pole.position.y = tall / 2; pole.castShadow = true; g.add(pole);
  const arm = new THREE.Mesh(rbox(1.1, 0.1, 0.1, 0.04, 4), mats.metalDark);
  arm.position.set(0.5, tall - 0.1, 0); g.add(arm);
  const head = new THREE.Mesh(rbox(0.42, 0.12, 0.22, 0.04, 4), mats.metalDark);
  head.position.set(1.0, tall - 0.18, 0); g.add(head);
  const bulb = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.11, 12, 10)), mats.lampGlow);
  bulb.position.set(1.0, tall - 0.28, 0); g.add(bulb);
  return g;
}

// Beveled window reveal: frame extrude + interior room box + glass, on a facade.
function windowReveal(mat, w, h, lit) {
  const g = new THREE.Group();
  const outer = rectShape(w + 0.24, h + 0.24);
  const hole = new THREE.Path();
  hole.moveTo(-w / 2, -h / 2); hole.lineTo(w / 2, -h / 2); hole.lineTo(w / 2, h / 2); hole.lineTo(-w / 2, h / 2); hole.closePath();
  outer.holes.push(hole);
  const frame = new THREE.Mesh(bevelExtrude(outer, 0.10, 0.035, 0.035, 3), mat.frame);
  frame.castShadow = true; g.add(frame);
  const room = new THREE.Mesh(rbox(w, h, 0.5, 0.04, 3),
    lit ? mat.roomLit : mat.roomDark);
  room.position.z = -0.28; g.add(room);
  const glass = new THREE.Mesh(rbox(w, h, 0.03, 0.01, 2), mat.glass);
  glass.position.z = 0.02; g.add(glass);
  // mullion cross
  const mull = new THREE.Mesh(rbox(0.05, h, 0.04, 0.015, 2), mat.frame);
  mull.position.z = 0.05; g.add(mull);
  const mull2 = new THREE.Mesh(rbox(w, 0.05, 0.04, 0.015, 2), mat.frame);
  mull2.position.z = 0.05; g.add(mull2);
  return g;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const landmarks = {};
  const updaters = [];
  const neonMats = [];
  const asphalt = asphaltSet(rng);
  const concrete = concreteSet(rng);
  const wood = woodSet(rng);
  const waterN = waterNormal(rng);

  const mats = {
    asphalt: phys({ map: asphalt.map, roughnessMap: asphalt.rough, normalMap: asphalt.normal, roughness: 1.0, bumpMap: asphalt.normal, bumpScale: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.9 }),
    concrete: phys({ map: concrete.map, normalMap: concrete.normal, roughness: 0.92, envMapIntensity: 0.6 }),
    sand: phys({ color: 0xd9c08a, roughness: 0.95 }),
    grass: phys({ color: 0x3f7a34, roughness: 0.95 }),
    metalDark: phys({ color: 0x2c2f36, metalness: 0.7, roughness: 0.45, clearcoat: 0.3 }),
    wood: phys({ map: wood.map, normalMap: wood.normal, roughness: 0.85 }),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xffe9b0 }),
    glass: glassMat(),
    frame: phys({ color: 0x3a3f4a, metalness: 0.5, roughness: 0.4 }),
    roomLit: phys({ color: 0x6a5230, emissive: 0xffc46a, emissiveIntensity: 1.4, roughness: 0.9 }),
    roomDark: phys({ color: 0x1a2030, roughness: 0.9 }),
  };
  // wet-road look for the storm preset is driven by clearcoat on the asphalt
  // material; keep a handle so main.js can raise it when it rains.
  mats.asphalt.userData.baseClearcoat = 0.55;

  const waterMat = phys({
    color: 0x0e4a5e, metalness: 0.1, roughness: 0.12, normalMap: waterN,
    normalScale: new THREE.Vector2(1.4, 1.4), clearcoat: 1.0, clearcoatRoughness: 0.06,
    transmission: 0.0, envMapIntensity: 1.6,
  });
  waterN.repeat.set(6, 6);

  // ---- ground + water
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), mats.concrete);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = -0.55; scene.add(water);
  updaters.push((dt, t) => {
    waterN.offset.x = t * 0.008; waterN.offset.y = t * 0.005;
    water.position.y = -0.55 + Math.sin(t * 0.7) * 0.05;
  });
  // beach sand strip along the south edge
  const beach = new THREE.Mesh(rbox(340, 0.3, 22, 0.1, 3), mats.sand);
  beach.position.set(0, 0.02, 158); beach.receiveShadow = true; scene.add(beach);

  // ---- roads: asphalt strips + raised rounded curbs + sidewalks
  const roadMat = mats.asphalt;
  for (let i = 0; i <= 16; i++) {
    const c = -160 + i * 20;
    for (const horiz of [true, false]) {
      const strip = new THREE.Mesh(rbox(horiz ? 340 : CITY.roadW, 0.08, horiz ? CITY.roadW : 340, 0.03, 2), roadMat);
      strip.position.set(horiz ? 0 : c, 0.04, horiz ? c : 0);
      strip.receiveShadow = true; scene.add(strip);
    }
  }
  // centre dashes (thin emissive-ish paint strips) on the two hero avenues
  for (const c of [-20, 20]) {
    for (let k = -150; k < 150; k += 8) {
      const dash = new THREE.Mesh(rbox(0.35, 0.02, 3.2, 0.01, 2), phys({ color: 0xd8b93a, roughness: 0.6 }));
      dash.position.set(c, 0.09, k); scene.add(dash);
    }
  }

  // ---- facades (shared 1024px atlases per district)
  const facDowntown = facadeSet(rng, { base: '#4a5266', floors: 14, cols: 8, lit: 0.34, glass: true });
  const facOld = facadeSet(rng, { base: '#7a5f46', floors: 6, cols: 7, lit: 0.22 });
  const facPort = facadeSet(rng, { base: '#5e6258', floors: 5, cols: 6, lit: 0.12 });
  const facMat = (fac, tint) => phys({
    map: fac.map, emissiveMap: fac.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.9,
    roughness: 0.75, metalness: 0.08, color: tint || 0xffffff, envMapIntensity: 0.7,
  });
  const downtownMat = facMat(facDowntown);
  const oldMat = facMat(facOld);
  const portMat = facMat(facPort);

  const heroBuildings = [];
  function building(x, z, w, d, h, mat, opts = {}) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const podiumH = Math.min(4.5, h * 0.22);
    const podium = new THREE.Mesh(rbox(w + 2.4, podiumH, d + 2.4, 0.15, 4),
      phys({ color: opts.podiumColor || 0x8a8578, roughness: 0.85 }));
    podium.position.y = podiumH / 2; podium.castShadow = true; podium.receiveShadow = true; g.add(podium);
    const tower = new THREE.Mesh(rbox(w, h, d, 0.15, 4), mat);
    tower.position.y = podiumH + h / 2; tower.castShadow = true; tower.receiveShadow = true; g.add(tower);
    // beveled cornice + parapet cap
    const cornice = new THREE.Mesh(bevelExtrude(rectShape(w + 1.2, d + 1.2), 0.5, 0.12, 0.12, 3),
      phys({ color: 0x6a655a, roughness: 0.8 }));
    cornice.rotation.x = -Math.PI / 2; cornice.position.y = podiumH + h + 0.1; cornice.castShadow = true; g.add(cornice);
    // rooftop plant
    const ac = new THREE.Mesh(rbox(w * 0.3, 0.9, d * 0.3, 0.08, 3), mats.metalDark);
    ac.position.set(w * 0.2, podiumH + h + 0.7, -d * 0.15); ac.castShadow = true; g.add(ac);
    if (h > 34) {
      const ant = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.05, 0.09, 7, 8)), mats.metalDark);
      ant.position.set(-w * 0.25, podiumH + h + 4, d * 0.2); g.add(ant);
      const tip = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.14, 8, 8)),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      tip.position.set(-w * 0.25, podiumH + h + 7.6, d * 0.2); g.add(tip);
      neonMats.push(tip.material);
    }
    // hero facade: real beveled reveals + interior boxes on the street face
    if (opts.hero) {
      const rows = 3, colsN = 4;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < colsN; c++) {
          const rev = windowReveal(mats, 1.5, 1.9, rng.next() < 0.4);
          rev.position.set(-w / 2 + (c + 0.5) * (w / colsN), podiumH + 2.2 + r * (h * 0.55 / rows), d / 2 + 0.06);
          g.add(rev);
        }
      }
      heroBuildings.push(g);
    }
    scene.add(g);
    colliders.push({ minX: x - (w + 2.4) / 2, maxX: x + (w + 2.4) / 2, minZ: z - (d + 2.4) / 2, maxZ: z + (d + 2.4) / 2 });
    return g;
  }

  // ---- city blocks (16x16 lattice, plots at road centres +/- 10)
  let tallest = null, tallestH = 0;
  for (let ix = 0; ix < 16; ix++) {
    for (let iz = 0; iz < 16; iz++) {
      const x = -150 + ix * 20, z = -150 + iz * 20;
      const dist = districtAt(x, z);
      if (dist === 'Marina & Beach' || dist === 'Hill Park') continue;
      if (Math.abs(x - 30) < 24 && Math.abs(z + 30) < 24) continue; // bank plaza
      if (Math.abs(x + 90) < 14 && Math.abs(z - 40) < 14) continue; // hideout yard
      if (rng.chance(0.16)) continue; // empty lot / park pocket
      let w, d, h, mat;
      if (dist === 'Downtown') { w = rng.range(9, 13); d = rng.range(9, 13); h = rng.range(18, 52); mat = downtownMat; }
      else if (dist === 'Old Town') { w = rng.range(9, 12); d = rng.range(9, 12); h = rng.range(7, 13); mat = oldMat; }
      else if (dist === 'Port & Industrial') { w = rng.range(10, 14); d = rng.range(10, 14); h = rng.range(6, 11); mat = portMat; }
      else { w = rng.range(9, 12); d = rng.range(9, 12); h = rng.range(10, 22); mat = downtownMat; }
      const hero = dist === 'Downtown' && h > 30 && rng.chance(0.45);
      const g = building(x, z, w, d, h, mat, { hero });
      if (h > tallestH) { tallestH = h; tallest = { g, x, z, h, w, d }; }
    }
  }

  // ---- helipad on the tallest tower
  if (tallest) {
    const padY = Math.min(4.5, tallest.h * 0.22) + tallest.h + 0.55;
    const pad = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(6.5, 6.5, 0.35, 24)), mats.concrete);
    pad.position.set(tallest.x, padY, tallest.z); pad.receiveShadow = true; scene.add(pad);
    const hTex = canvasTexLocal('H');
    const hMark = new THREE.Mesh(new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ map: hTex, transparent: true }));
    hMark.rotation.x = -Math.PI / 2; hMark.position.set(tallest.x, padY + 0.2, tallest.z); scene.add(hMark);
    landmarks.helipad = new THREE.Vector3(tallest.x, padY + 0.4, tallest.z);
    // parked helicopter silhouette handled by police.js; keep a static one here
    landmarks.tallestRoof = new THREE.Vector3(tallest.x, padY, tallest.z);
  }
  function canvasTexLocal(letter) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(128, 128, 112, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 150px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 134);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---- BANK (hero set-piece): columns, beveled sign, glass front + lit interior
  const bank = new THREE.Group(); bank.position.set(30, 0, -30); scene.add(bank);
  const bankBase = new THREE.Mesh(rbox(26, 1.2, 16, 0.15, 4), phys({ color: 0xb8b0a0, roughness: 0.8 }));
  bankBase.position.y = 0.6; bankBase.receiveShadow = true; bank.add(bankBase);
  const bankHall = new THREE.Mesh(rbox(22, 9, 12, 0.15, 4), phys({ color: 0xd8cfb8, roughness: 0.7 }));
  bankHall.position.y = 1.2 + 4.5; bankHall.castShadow = true; bankHall.receiveShadow = true; bank.add(bankHall);
  // glass front with real interior boxes behind it (cash counters, lights)
  const glassFront = new THREE.Mesh(rbox(18, 6.5, 0.2, 0.05, 3), lensMat(0xcfe8f0));
  glassFront.position.set(0, 4.6, 6.05); bank.add(glassFront);
  for (let i = -1; i <= 1; i++) {
    const counter = new THREE.Mesh(rbox(3.4, 1.1, 1.2, 0.08, 3), phys({ color: 0x4a3423, roughness: 0.6, clearcoat: 0.4 }));
    counter.position.set(i * 5.4, 1.9, 3.4); bank.add(counter);
    const cash = new THREE.Mesh(rbox(1.1, 0.35, 0.7, 0.05, 3), phys({ color: 0x3fae5a, emissive: 0x1a5a2a, emissiveIntensity: 0.5, roughness: 0.5 }));
    cash.position.set(i * 5.4, 2.6, 3.4); bank.add(cash);
    const ceilLight = new THREE.Mesh(rbox(2.2, 0.08, 0.5, 0.02, 2), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
    ceilLight.position.set(i * 5.4, 8.6, 3.4); bank.add(ceilLight);
    neonMats.push(ceilLight.material);
  }
  // columns: tapered lathe shafts + beveled capital/base rings
  for (let i = -1.5; i <= 1.5; i++) {
    const cx = i * 5.2;
    const shaftPts = [[0.001, 0], [0.55, 0.05], [0.5, 0.6], [0.46, 5.4], [0.52, 6.4], [0.001, 6.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const shaft = new THREE.Mesh(smoothGeo(new THREE.LatheGeometry(shaftPts, 20)), phys({ color: 0xe8e2d2, roughness: 0.55 }));
    shaft.position.set(cx, 1.2, 6.6); shaft.castShadow = true; bank.add(shaft);
    const cap = new THREE.Mesh(bevelExtrude(rectShape(1.6, 1.6), 0.35, 0.06, 0.06, 3), phys({ color: 0xc8bfa8, roughness: 0.6 }));
    cap.rotation.x = -Math.PI / 2; cap.position.set(cx, 7.75, 6.6); bank.add(cap);
    const base = new THREE.Mesh(bevelExtrude(rectShape(1.7, 1.7), 0.3, 0.06, 0.06, 3), phys({ color: 0xc8bfa8, roughness: 0.6 }));
    base.rotation.x = -Math.PI / 2; base.position.set(cx, 1.25, 6.6); bank.add(base);
  }
  // beveled sign with real depth + emissive face
  const signTex = signTexture(rng, 'SOLMAR RESERVE', { w: 1024, h: 256 });
  const signBack = new THREE.Mesh(bevelExtrude(rectShape(15, 3.4), 0.5, 0.1, 0.1, 4), phys({ color: 0x101c3a, roughness: 0.4, clearcoat: 0.6 }));
  signBack.position.set(0, 11.4, 5.4); signBack.castShadow = true; bank.add(signBack);
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 3.2),
    new THREE.MeshBasicMaterial({ map: signTex }));
  signFace.position.set(0, 11.4, 5.68); bank.add(signFace);
  neonMats.push(signFace.material);
  // steps + bollards
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(rbox(20 - s * 2, 0.35, 3.5 + s * 1.2, 0.06, 3), mats.concrete);
    step.position.set(0, 0.18 + s * 0.3, 8.6 + s * 0.8); step.receiveShadow = true; bank.add(step);
  }
  for (let i = -4; i <= 4; i++) {
    const bol = new THREE.Mesh(rbox(0.35, 0.9, 0.35, 0.1, 4), paintMat(0xd8b93a));
    bol.position.set(i * 2.2, 1.0, 11.5); bol.castShadow = true; bank.add(bol);
  }
  colliders.push({ minX: 30 - 13, maxX: 30 + 13, minZ: -30 - 8, maxZ: -30 + 8 });
  landmarks.bank = new THREE.Vector3(30, 0, -22);
  landmarks.bankInterior = [
    new THREE.Vector3(30 - 5.4, 0, -30 + 3.4), new THREE.Vector3(30, 0, -30 + 3.4), new THREE.Vector3(30 + 5.4, 0, -30 + 3.4),
  ];

  // ---- neon signs downtown
  const neonDefs = [
    ['SOLMAR', 0xffd76a, -60, -60], ['HOTEL', 0x54e0ff, 60, -80], ['CASINO', 0xff5aa8, -40, -100], ['24H TACOS', 0x9dff6a, 80, -40],
  ];
  for (const [txt, col, x, z] of neonDefs) {
    const tex = signTexture(rng, txt, { fg: '#' + col.toString(16).padStart(6, '0'), bg: '#0a0a14', font: 'bold 110px Arial' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, 12, z + 6.6); scene.add(m);
    neonMats.push(m.material);
    const back = new THREE.Mesh(bevelExtrude(rectShape(10.4, 2.9), 0.25, 0.06, 0.06, 3), phys({ color: 0x0a0a14, roughness: 0.5 }));
    back.position.set(x, 12, z + 6.45); scene.add(back);
  }

  // ---- suspension bridge east (deck + towers + cables over the bay)
  const bridge = new THREE.Group(); scene.add(bridge);
  const deck = new THREE.Mesh(rbox(110, 1.2, 12, 0.2, 3), mats.asphalt);
  deck.position.set(215, 6, -40); deck.castShadow = true; bridge.add(deck);
  for (const tx of [185, 245]) {
    const tower = new THREE.Mesh(rbox(2.2, 34, 2.2, 0.2, 3), phys({ color: 0xc8542e, roughness: 0.5, clearcoat: 0.5 }));
    tower.position.set(tx, 22, -40); tower.castShadow = true; bridge.add(tower);
    const cross = new THREE.Mesh(rbox(2, 2, 12, 0.15, 3), phys({ color: 0xc8542e, roughness: 0.5 }));
    cross.position.set(tx, 34, -40); bridge.add(cross);
  }
  const cableMat = phys({ color: 0xdddddd, metalness: 0.8, roughness: 0.35 });
  for (const side of [-5.4, 5.4]) {
    const pts = [new THREE.Vector3(162, 8, -40 + side), new THREE.Vector3(215, 38, -40 + side), new THREE.Vector3(268, 8, -40 + side)];
    const curve = new THREE.CatmullRomCurve3(pts);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.14, 6), cableMat);
    bridge.add(cable);
    for (let k = 0; k <= 10; k++) {
      const bx = 168 + k * 9.4;
      const cy = 8 + Math.sin((k / 10) * Math.PI) * 26;
      const v = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.05, 0.05, cy - 6.6, 6)), cableMat);
      v.position.set(bx, (cy + 6.6) / 2, -40 + side); bridge.add(v);
    }
  }
  landmarks.bridge = new THREE.Vector3(215, 6, -40);

  // ---- lighthouse on the south point (lathe tower + rotating beam)
  const light = new THREE.Group(); light.position.set(-30, 0, 178); scene.add(light);
  const stripeTex = canvasTexLocalStripes(rng);
  const towerPts = [[0.001, 0], [3.4, 0], [3.2, 2], [2.6, 10], [2.2, 18], [2.0, 22], [0.001, 22.4]].map(([r, y]) => new THREE.Vector2(r, y));
  const lt = new THREE.Mesh(smoothGeo(new THREE.LatheGeometry(towerPts, 24)), phys({ map: stripeTex, roughness: 0.7 }));
  lt.castShadow = true; light.add(lt);
  const lampRoom = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16)), lensMat(0xfff2b0));
  lampRoom.position.y = 23.4; light.add(lampRoom);
  const lampCore = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.9, 12, 10)), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  lampCore.position.y = 23.4; light.add(lampCore);
  neonMats.push(lampCore.material);
  const beamGeo = new THREE.ConeGeometry(7, 55, 20, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.z = Math.PI / 2; beam.position.set(26, 23.4, 0); light.add(beam);
  updaters.push((dt, t) => { light.rotation.y = t * 0.35; });
  landmarks.lighthouse = new THREE.Vector3(-30, 0, 178);
  function canvasTexLocalStripes() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#f2ede4' : '#c8342a'; ctx.fillRect(0, i * 32, 128, 32); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---- marina: wooden docks, lathe pilings, moored boats
  const marina = new THREE.Group(); marina.position.set(40, 0, 168); scene.add(marina);
  for (let d = 0; d < 3; d++) {
    const dock = new THREE.Mesh(rbox(3.2, 0.5, 26, 0.12, 3), mats.wood);
    dock.position.set(d * 14 - 14, 0.4, 0); dock.receiveShadow = true; marina.add(dock);
    for (let p = 0; p < 4; p++) {
      const pilPts = [[0.001, 0], [0.22, 0], [0.2, 1.2], [0.26, 1.35], [0.001, 1.4]].map(([r, y]) => new THREE.Vector2(r, y));
      const pil = new THREE.Mesh(smoothGeo(new THREE.LatheGeometry(pilPts, 10)), mats.wood);
      pil.position.set(d * 14 - 14 + (p % 2 ? 1.7 : -1.7), -0.2, -11 + p * 7); marina.add(pil);
    }
    const boat = makeBoat(rng.pick([0x2a6fd8, 0xd82a2a, 0xf2f2f2]));
    boat.group.position.set(d * 14 - 14 + 4.5, -0.1, -4 + d * 3);
    boat.group.rotation.y = Math.PI / 2;
    marina.add(boat.group);
  }
  landmarks.marina = new THREE.Vector3(40, 0, 162);
  landmarks.marinaBoat = new THREE.Vector3(40 + 4.5, 0, 158);

  // ---- hill park NW: mound, viewpoint, trees, benches
  const hill = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(46, 24, 16)), mats.grass);
  hill.scale.set(1, 0.32, 1); hill.position.set(-118, -1.5, -118); hill.receiveShadow = true; scene.add(hill);
  colliders.push({ minX: -160, maxX: -78, minZ: -160, maxZ: -78 });
  const view = new THREE.Mesh(rbox(10, 0.6, 8, 0.15, 3), mats.concrete);
  view.position.set(-112, 12.6, -112); view.receiveShadow = true; scene.add(view);
  for (let i = 0; i < 8; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.18, 0.3, 2.6, 8)), phys({ color: 0x5a3d22, roughness: 0.95 }));
    trunk.position.y = 1.3; tree.add(trunk);
    const crown = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(2.2, 12, 10)), phys({ color: 0x2f6b2a, roughness: 0.95 }));
    crown.position.y = 3.6; crown.scale.y = 0.85; crown.castShadow = true; tree.add(crown);
    tree.position.set(-118 + rng.range(-26, 26), 11 + rng.range(-2, 2), -118 + rng.range(-26, 26));
    scene.add(tree);
  }
  landmarks.hill = new THREE.Vector3(-112, 12.6, -112);

  // ---- street props: lamps, hydrants, palms, stalls, containers, cranes
  const lampPositions = [];
  for (let i = 0; i < 26; i++) {
    const x = rng.pick([-150, -130, -110, -90, -70, -50, -30, -10, 10, 30, 50, 70, 90, 110, 130, 150]) + rng.range(-4, 4);
    const z = rng.pick([-150, -130, -110, -90, -70, -50, -30, -10, 10, 30, 50, 70, 90, 110, 130, 150]) + rng.range(-4, 4);
    if (districtAt(x, z) === 'Marina & Beach') continue;
    const lamp = lampPost(mats);
    lamp.position.set(x + 5.5, 0, z); lamp.rotation.y = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    scene.add(lamp); lampPositions.push(lamp);
  }
  for (let i = 0; i < 10; i++) {
    const hyd = new THREE.Group();
    const body = new THREE.Mesh(rbox(0.5, 0.9, 0.5, 0.12, 4), paintMat(0xc8342a));
    body.position.y = 0.45; body.castShadow = true; hyd.add(body);
    const capH = new THREE.Mesh(smoothGeo(new THREE.SphereGeometry(0.28, 12, 8)), paintMat(0xc8342a));
    capH.position.y = 0.95; capH.scale.y = 0.7; hyd.add(capH);
    hyd.position.set(rng.range(-140, 140), 0, rng.range(-140, 100));
    scene.add(hyd);
  }
  for (let i = 0; i < 22; i++) {
    const palm = palmTree(rng, mats);
    const beachSide = i < 12;
    palm.position.set(beachSide ? rng.range(-140, 140) : rng.range(-140, 140), 0, beachSide ? rng.range(140, 152) : rng.range(-140, 120));
    palm.scale.setScalar(rng.range(0.85, 1.25));
    scene.add(palm);
  }
  // vendor stalls in Old Town plaza
  for (let i = 0; i < 5; i++) {
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(rbox(2.6, 1.0, 1.4, 0.08, 3), mats.wood);
    counter.position.y = 0.5; counter.castShadow = true; stall.add(counter);
    const awn = new THREE.Mesh(rbox(3.0, 0.12, 2.0, 0.05, 3), fabricMat(rng.pick([0xd82a5a, 0x2a8fd8, 0xf2a81a])));
    awn.position.y = 2.3; awn.rotation.x = 0.12; stall.add(awn);
    for (const px of [-1.2, 1.2]) for (const pz of [-0.8, 0.8]) {
      const pole = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8)), mats.metalDark);
      pole.position.set(px, 1.15, pz); stall.add(pole);
    }
    stall.position.set(-90 + i * 6, 0, 62 + (i % 2) * 5);
    stall.rotation.y = rng.range(-0.4, 0.4);
    scene.add(stall);
    colliders.push({ minX: -90 + i * 6 - 1.6, maxX: -90 + i * 6 + 1.6, minZ: 62 + (i % 2) * 5 - 1, maxZ: 62 + (i % 2) * 5 + 1 });
  }
  // port containers + cranes
  const contColors = [0x2a6fd8, 0xc8542e, 0x3fae5a, 0xd8b93a, 0x8a2ad8];
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Mesh(rbox(6, 2.6, 2.6, 0.1, 3), paintMat(contColors[i % contColors.length], { roughness: 0.5 }));
    c.position.set(110 + (i % 6) * 7.5, 1.3 + Math.floor(i / 6) * 2.7, -100 + Math.floor(i / 6) * 12);
    c.rotation.y = (i % 3) * 0.03; c.castShadow = true; scene.add(c);
    colliders.push({ minX: c.position.x - 3, maxX: c.position.x + 3, minZ: c.position.z - 1.4, maxZ: c.position.z + 1.4 });
  }
  for (let i = 0; i < 2; i++) {
    const crane = new THREE.Group();
    const mast = new THREE.Mesh(rbox(2, 26, 2, 0.15, 3), paintMat(0xd8b93a));
    mast.position.y = 13; mast.castShadow = true; crane.add(mast);
    const jib = new THREE.Mesh(rbox(22, 1.4, 1.4, 0.12, 3), paintMat(0xd8b93a));
    jib.position.set(8, 25, 0); crane.add(jib);
    const cable = new THREE.Mesh(smoothGeo(new THREE.CylinderGeometry(0.03, 0.03, 8, 6)), mats.metalDark);
    cable.position.set(16, 21, 0); crane.add(cable);
    crane.position.set(130 + i * 20, 0, -120);
    scene.add(crane);
  }
  // garage + hideout + hospital markers (simple signed structures)
  function smallLot(x, z, label, color) {
    const g = new THREE.Group();
    const hut = new THREE.Mesh(rbox(8, 4.5, 7, 0.15, 4), phys({ color, roughness: 0.8 }));
    hut.position.y = 2.25; hut.castShadow = true; g.add(hut);
    const tex = signTexture(rng, label, { w: 512, h: 128, fg: '#ffffff', bg: '#222222', font: 'bold 64px Arial' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
    s.position.set(0, 3.6, 3.55); g.add(s);
    g.position.set(x, 0, z); scene.add(g);
    colliders.push({ minX: x - 4, maxX: x + 4, minZ: z - 3.5, maxZ: z + 3.5 });
    return new THREE.Vector3(x, 0, z + 6);
  }
  landmarks.garage = smallLot(-20, 20, 'GARAGE', 0x4a5a6a);
  landmarks.hideout = smallLot(-90, 40, 'HIDEOUT', 0x5a4a3a);
  landmarks.hospital = smallLot(90, -90, 'HOSPITAL', 0x6a8a7a);

  // ---- hidden package spots (10, deterministic)
  const pkgSpots = [
    [-140, -140], [140, -140], [-140, 120], [140, 120], [0, -140],
    [-100, -20], [100, 20], [-20, 100], [60, -120], [-120, -60],
  ];
  landmarks.packages = pkgSpots.map(([x, z]) => new THREE.Vector3(x, 0, z));

  return {
    colliders, landmarks, neonMats, waterMat, asphaltMat: mats.asphalt,
    districtAt,
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}
