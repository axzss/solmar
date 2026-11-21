// SOLMAR v4 — procedural 1024px canvas textures + MeshPhysicalMaterial helpers.
// Every surface gets a real map / normal / roughness at 1024px with anisotropy 16,
// and every box is a RoundedBoxGeometry with merged vertices + smooth normals.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export let MAX_ANISO = 16;
export function setMaxAniso(n) { MAX_ANISO = n; }

export function smoothGeo(geo) {
  let g = geo;
  try { g = mergeVertices(g, 1e-4); } catch (e) { /* keep original */ }
  g.computeVertexNormals();
  return g;
}

// Rounded box, radius in metres, segments 4-8 — the #1 anti-boxy primitive.
export function rbox(w, h, d, radius = 0.08, seg = 5) {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
  return smoothGeo(new RoundedBoxGeometry(w, h, d, seg, r));
}

// Beveled extrude from a 2D shape (facade reveals, signs, trim).
export function bevelExtrude(shape, depth, bt = 0.08, bs = 0.08, bseg = 4) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs,
    bevelSegments: bseg, bevelOffset: 0, curveSegments: 8,
  });
  return smoothGeo(g);
}
export function rectShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2); s.closePath();
  return s;
}
export function canvasTex(size, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
// Normal map from a deterministic height function, 1024px, Sobel-style.
export function normalFromHeight(size, heightFn, strength = 2.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const h = (x, y) => heightFn((x % size) / size, (y % size) / size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      d[i] = Math.round((dx * inv * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  return t;
}

export function phys(opts = {}) {
  return new THREE.MeshPhysicalMaterial(Object.assign({ envMapIntensity: 1.0 }, opts));
}
export function paintMat(color, { metalness = 0.65, roughness = 0.28 } = {}) {
  return phys({
    color, metalness, roughness,
    clearcoat: 1.0, clearcoatRoughness: 0.08,
    clearcoatNormalScale: new THREE.Vector2(0.4, 0.4),
  });
}
export function fabricMat(color, sheenColor = 0x888888) {
  return phys({
    color, metalness: 0.0, roughness: 0.92,
    sheen: 1.0, sheenColor: new THREE.Color(sheenColor), sheenRoughness: 0.55,
  });
}
export function glassMat(color = 0x9fd8e8, opacity = 0.55) {
  return phys({
    color, metalness: 0.15, roughness: 0.06, transparent: true, opacity,
    clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.6,
  });
}
export function lensMat(color = 0xffffff) {
  // transmission glass for lenses / bank glass — real refraction layer.
  return phys({
    color, metalness: 0.0, roughness: 0.05, transmission: 0.9, thickness: 0.4,
    ior: 1.48, attenuationColor: new THREE.Color(0x223344), attenuationDistance: 1.2,
    clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.5,
  });
}
export function rubberMat() {
  const m = phys({ color: 0x0b0b0c, metalness: 0.0, roughness: 0.92, anisotropy: 0.85 });
  return m;
}
export function chromeMat() {
  return phys({ color: 0xd8dde2, metalness: 1.0, roughness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.05, anisotropy: 0.9 });
}

// --- 1024px procedural surface sets -------------------------------------
export function asphaltSet(rng) {
  const map = canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = '#232428'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 26000; i++) {
      const g = rng.int(14, 62);
      ctx.fillStyle = `rgb(${g},${g + 2},${g + 5})`;
      ctx.fillRect(rng.next() * s, rng.next() * s, rng.range(1, 2.6), rng.range(1, 2.6));
    }
    // tire-wear darkening in the two lane tracks + cracks + tar seams
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(s * 0.16, 0, s * 0.10, s); ctx.fillRect(s * 0.74, 0, s * 0.10, s);
    ctx.strokeStyle = 'rgba(8,8,10,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      let x = rng.next() * s, y = rng.next() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rng.range(-26, 26); y += rng.range(10, 46); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // faded dashed centre line + edge lines
    ctx.fillStyle = 'rgba(230,200,90,0.85)';
    for (let y = 0; y < s; y += 86) ctx.fillRect(s * 0.485, y, s * 0.03, 46);
    ctx.fillStyle = 'rgba(220,220,210,0.5)';
    ctx.fillRect(s * 0.02, 0, 5, s); ctx.fillRect(s * 0.97, 0, 5, s);
  });
  const rough = canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = '#b4b4b4'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const g = rng.int(120, 235);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(rng.next() * s, rng.next() * s, rng.range(1, 3), rng.range(1, 3));
    }
    // wet puddle patches: very low roughness (dark = smooth)
    for (let i = 0; i < 14; i++) {
      const x = rng.next() * s, y = rng.next() * s, r = rng.range(30, 110);
      const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(28,28,28,0.9)'); gr.addColorStop(1, 'rgba(28,28,28,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, { srgb: false });
  const normal = normalFromHeight(1024, (u, v) =>
    rng.noise2(u * 90, v * 90) * 0.6 + rng.noise2(u * 260, v * 260) * 0.4, 1.6);
  normal.repeat.set(4, 4);
  return { map, rough, normal };
}
export function concreteSet(rng) {
  const map = canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = '#8f8b82'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 18000; i++) {
      const g = rng.int(110, 175);
      ctx.fillStyle = `rgb(${g},${g - 3},${g - 10})`;
      ctx.fillRect(rng.next() * s, rng.next() * s, rng.range(1, 3), rng.range(1, 3));
    }
    ctx.strokeStyle = 'rgba(60,58,52,0.7)'; ctx.lineWidth = 3; // expansion joints
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * s / 4, 0); ctx.lineTo(i * s / 4, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s / 4); ctx.lineTo(s, i * s / 4); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,38,34,0.25)';
    for (let i = 0; i < 40; i++) ctx.fillRect(rng.next() * s, rng.next() * s, rng.range(8, 60), rng.range(4, 18));
  });
  const normal = normalFromHeight(1024, (u, v) =>
    rng.noise2(u * 70, v * 70) * 0.7 + rng.noise2(u * 200, v * 200) * 0.3, 1.2);
  return { map, normal };
}
export function woodSet(rng) {
  const map = canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = '#7a5a38'; ctx.fillRect(0, 0, s, s);
    for (let p = 0; p < 8; p++) {
      const y0 = p * s / 8;
      ctx.fillStyle = `rgb(${118 + rng.int(-14, 14)},${86 + rng.int(-10, 10)},${52 + rng.int(-8, 8)})`;
      ctx.fillRect(0, y0, s, s / 8 - 3);
      ctx.strokeStyle = 'rgba(40,24,10,0.8)'; ctx.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        ctx.beginPath(); ctx.moveTo(0, y0 + rng.range(4, s / 8 - 6));
        ctx.bezierCurveTo(s * 0.3, y0 + rng.range(0, s / 8), s * 0.7, y0 + rng.range(0, s / 8), s, y0 + rng.range(4, s / 8 - 6));
        ctx.stroke();
      }
    }
  });
  const normal = normalFromHeight(1024, (u, v) =>
    rng.noise2(u * 40, v * 300) * 0.8 + rng.noise2(u * 160, v * 160) * 0.2, 1.0);
  return { map, normal };
}
export function waterNormal(rng) {
  return normalFromHeight(1024, (u, v) =>
    rng.noise2(u * 24 + 0.13, v * 24) * 0.55 + rng.noise2(u * 64, v * 64 + 0.31) * 0.45, 2.2);
}
// Facade: 1024px window atlas — varied curtains/blinds, some lit; returns map + emissiveMap.
export function facadeSet(rng, { base = '#5a5f6e', floors = 12, cols = 8, lit = 0.28, glass = false } = {}) {
  const litCells = [];
  const map = canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    // grime + panel variation
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.09)})`;
      ctx.fillRect(rng.next() * s, rng.next() * s, rng.range(6, 60), rng.range(6, 40));
    }
    const cw = s / cols, fh = s / floors;
    for (let f = 0; f < floors; f++) {
      // floor slab shadow line
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, f * fh, s, 3);
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.16, y = f * fh + fh * 0.2, w = cw * 0.68, h = fh * 0.58;
        const isLit = rng.next() < lit;
        if (isLit) litCells.push([x, y, w, h]);
        // frame + sill (reveal depth painted + real geometry on hero buildings)
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
        ctx.fillStyle = isLit ? (rng.chance(0.6) ? '#ffd98a' : '#cfe8ff') : (glass ? '#1d2f42' : '#20242e');
        ctx.fillRect(x, y, w, h);
        // curtains / blinds / mullion
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        if (rng.chance(0.5)) ctx.fillRect(x, y, w, h * rng.range(0.25, 0.6));
        ctx.fillRect(x + w / 2 - 2, y, 4, h);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y, w, 3);
      }
    }
  });
  const emissiveMap = canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, s, s);
    for (const [x, y, w, h] of litCells) {
      ctx.fillStyle = rng.chance(0.6) ? '#ffca6a' : '#bfe0ff';
      ctx.fillRect(x, y, w, h);
    }
  }, { srgb: false });
  return { map, emissiveMap };
}
export function signTexture(rng, text, { w = 1024, h = 256, fg = '#ffd76a', bg = '#101c3a', font = 'bold 96px Georgia' } = {}) {
  return canvasTex(w, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,215,106,0.9)'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = fg; ctx.shadowBlur = 26;
    ctx.fillStyle = fg; ctx.fillText(text, w / 2, h / 2 + 4);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff3c4'; ctx.fillText(text, w / 2, h / 2 + 4);
  });
}
