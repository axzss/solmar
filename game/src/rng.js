// SOLMAR v4 — seeded RNG (mulberry32). Deterministic staging for ?shot=&seed=.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeRng(seed = 7) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    // deterministic 2D value noise in [0,1]
    noise2: (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const h = (ix, iy) => {
        let n = (ix * 374761393 + iy * 668265263) ^ (seed * 974634);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return (((n ^ (n >>> 16)) >>> 0) % 100000) / 100000;
      };
      const s = (t) => t * t * (3 - 2 * t);
      const u = s(xf), v = s(yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    },
  };
}
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
