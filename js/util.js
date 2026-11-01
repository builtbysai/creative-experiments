// Small shared helpers: maths, seeded randomness, value noise and colour utilities.

export const TAU = Math.PI * 2;
export const PI = Math.PI;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const angDiff = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
export const rr = (a, b) => a + Math.random() * (b - a);
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Deterministic random numbers (mulberry32). Same seed, same dragon. */
export class Rng {
  constructor(seed = 1) { this.t = seed >>> 0; }
  next() {
    this.t = (this.t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(this.t ^ (this.t >>> 15), 1 | this.t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) / 0.58; }
}

// ---- value noise -------------------------------------------------------
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, seed = 0, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// ---- colour --------------------------------------------------------------
const _rgb = new Map();
export function rgbOf(h) {
  let c = _rgb.get(h);
  if (!c) { const n = parseInt(h.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _rgb.set(h, c); }
  return c;
}
export function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b); t = t < 0 ? 0 : t > 1 ? 1 : t;
  return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
}
export function rgba(h, a) { const c = rgbOf(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
