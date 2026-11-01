// Backdrops: what the dragons walk on. The default is the paper page (page.js + paper.js). These two are alternatives
// the World can swap in from the dock; each draws its own ground, reacts to the dragons' bodies and to the breath
// (the World hands over the hot breath particles each frame), and has a day and a night look to match the theme.
//
//   Garden   grass that bends under the body and springs back, flowers, bees and butterflies by day and fireflies by
//            night. Fire scorches a patch to ash; the grass and flowers grow back.
//   Weather  rain that sizzles into steam on scorched paper, wind that carries the smoke (and bends the flames), and
//            fog that parts around the dragons and slowly closes behind them.

import { TAU, PI, clamp, lerp, rr, noise2, fbm, hsl } from './util.js';

const sprite = (stops, size = 64) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), r = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) r.addColorStop(o, col); x.fillStyle = r; x.fillRect(0, 0, size, size); return c;
};
const SOFT = sprite([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']], 128);
const FIREFLY = sprite([[0, 'rgba(235,255,150,1)'], [0.3, 'rgba(190,255,90,.5)'], [1, 'rgba(120,220,40,0)']]);
const STEAM = sprite([[0, 'rgba(245,248,250,.8)'], [0.55, 'rgba(235,240,246,.4)'], [1, 'rgba(225,232,240,0)']]);
const SMOKE_L = sprite([[0, 'rgba(84,72,64,.5)'], [0.6, 'rgba(84,72,64,.2)'], [1, 'rgba(84,72,64,0)']]);
const SMOKE_D = sprite([[0, 'rgba(170,164,158,.4)'], [0.6, 'rgba(170,164,158,.16)'], [1, 'rgba(170,164,158,0)']]);
const MIST_L = sprite([[0, 'rgba(238,243,248,.9)'], [0.55, 'rgba(228,236,244,.5)'], [1, 'rgba(220,230,240,0)']], 128);
const MIST_D = sprite([[0, 'rgba(92,102,120,.7)'], [0.55, 'rgba(84,94,112,.4)'], [1, 'rgba(76,86,104,0)']], 128);

/** Points along every dragon's body: where the ground is touched. */
function bodyPoints(world, step = 2, pad = 1.5) {
  const out = [];
  for (const d of world.dragons) for (let i = 0; i < d.S.length; i += step) { const s = d.S[i]; out.push([s.x, s.y, s.hw * pad + 10]); }
  return out;
}

class Backdrop {
  constructor(world) { this.world = world; this.W = 0; this.H = 0; }
  get u() { return clamp(Math.min(this.world.W / 1100, this.world.H / 760), 0.62, 1.25); }
  get dark() { return this.world.theme.dark; }
  resize() { this.W = this.world.W; this.H = this.world.H; this.build(); }
  build() {}
  reset() { this.build(); }
  update() {}
  draw() {}
  drawTop() {}
}

// ====================================================================================================
// Garden
// ====================================================================================================
const DAY = { shades: ['#4c8a34', '#5da042', '#3f7a2c', '#77b34f'], ground: [118, 168, 78], stem: '#3e7a2a', char: '#2a2622' };
const NIGHT = { shades: ['#1d4a38', '#27614a', '#173b2d', '#31735a'], ground: [22, 52, 46], stem: '#1c4a34', char: '#0c0b0a' };
const BLOOMS = [[348, 0.82, 0.62], [48, 0.95, 0.58], [0, 0, 0.97], [272, 0.65, 0.7], [28, 0.95, 0.58]];     // h, s, l

export class Garden extends Backdrop {
  /** What the dragons stalk: the butterflies, but only by day. */
  get butterflies() { const self = this; return { get list() { return self.dark ? [] : self.bfs; }, nearest(x, y) { let best = null, bd = 1e9; for (const b of this.list) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } } return best ? { bf: best, d: bd } : null; } }; }
  build() {
    const w = this.world, W = this.W, H = this.H, u = this.u, GC = this.GC = 12;
    this.gw = Math.ceil(W / GC); this.gh = Math.ceil(H / GC); this.heat = new Float32Array(this.gw * this.gh); this.ash = new Float32Array(this.gw * this.gh);
    this.paintGround();
    const N = clamp(W * H / 110, 2500, 11000) | 0; this.blades = [];
    for (let i = 0; i < N; i++) { const y = rr(0, H); this.blades.push({ x: rr(0, W), y, h: rr(14, 32) * u * (0.75 + y / H * 0.5), lean: rr(-5, 5), c: Math.random() * 4 | 0, flat: 0, fa: 0, burn: 0, ph: Math.random() * 9 }); }
    this.blades.sort((a, b) => a.y - b.y);
    this.flowers = [];
    for (let i = 0; i < Math.round(W * H / 30000); i++) this.flowers.push({ x: rr(50, W - 50), y: rr(H * 0.12, H - 70), h: rr(34, 62) * u, bloom: BLOOMS[Math.random() * BLOOMS.length | 0], g: 1, burn: 0, ph: Math.random() * 9, n: 5 + (Math.random() * 3 | 0) });
    this.flowers.sort((a, b) => a.y - b.y);
    this.flyers = [];
    for (let i = 0; i < 5; i++) this.flyers.push({ k: 'bee', x: rr(0, W), y: rr(0, H), a: rr(0, TAU), f: this.flowers[i * 3 % Math.max(1, this.flowers.length)], t: 0, ph: Math.random() * 9 });
    for (let i = 0; i < 4; i++) this.flyers.push({ k: 'bf', x: rr(0, W), y: rr(0, H), a: rr(0, TAU), hue: [330, 40, 200, 280][i], ph: Math.random() * 9, t: 0 });
    this.bfs = this.flyers.filter(q => q.k === 'bf');
    for (let i = 0; i < 14; i++) this.flyers.push({ k: 'fly', x: rr(0, W), y: rr(0, H), a: rr(0, TAU), ph: Math.random() * 9, t: 0 });
    this.lastCrackle = 0;
  }
  paintGround() {
    const s = 8, W = this.W, H = this.H, w = Math.ceil(W / s), h = Math.ceil(H / s), c = this.groundC = document.createElement('canvas'); c.width = w; c.height = h;
    const q = c.getContext('2d'), d = q.createImageData(w, h), P = this.dark ? NIGHT : DAY, g0 = P.ground, k = this.dark ? 0.35 : 1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const n = fbm(i * 0.08, j * 0.08, 4, 3), t = j / h, o = (j * w + i) * 4; d.data[o] = g0[0] + (n * 50 - t * 30) * k; d.data[o + 1] = g0[1] + (n * 46 - t * 36) * k; d.data[o + 2] = g0[2] + (n * 30 - t * 20) * k; d.data[o + 3] = 255; }
    q.putImageData(d, 0, 0);
  }
  themeChanged() { this.paintGround(); }
  update(dt) {
    const w = this.world, hot = w.hot, GC = this.GC, gw = this.gw, gh = this.gh, heat = this.heat, ash = this.ash;
    heat.fill(0);
    for (const h of hot) { const i0 = Math.max(0, (h.x - h.r) / GC | 0), i1 = Math.min(gw - 1, (h.x + h.r) / GC | 0), j0 = Math.max(0, (h.y - h.r) / GC | 0), j1 = Math.min(gh - 1, (h.y + h.r) / GC | 0);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * gw + i; if (Math.hypot(i * GC - h.x, j * GC - h.y) < h.r) heat[k] = Math.max(heat[k], h.p); } }
    for (let k = 0; k < heat.length; k++) { if (heat[k] > 0.2) ash[k] = Math.min(1, ash[k] + dt * 2 * heat[k]); else if (ash[k] > 0) ash[k] = Math.max(0, ash[k] - dt / 30); }
    const pts = bodyPoints(w); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0] - p[2]); x1 = Math.max(x1, p[0] + p[2]); y0 = Math.min(y0, p[1] - p[2]); y1 = Math.max(y1, p[1] + p[2]); }
    const recover = dt * 0.13;
    for (const b of this.blades) {
      if (b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1) { let hit = false; for (const p of pts) { const dx = b.x - p[0], dy = b.y - p[1]; if (dx * dx + dy * dy < p[2] * p[2]) { b.flat = 1; b.fa = Math.atan2(dy, dx); hit = true; break; } } if (!hit && b.flat > 0) b.flat = Math.max(0, b.flat - recover); }
      else if (b.flat > 0) b.flat = Math.max(0, b.flat - recover);
      const k = (b.y / GC | 0) * gw + (b.x / GC | 0); if (heat[k] > 0.25) b.burn = 1; else if (b.burn > 0) b.burn = Math.max(0, b.burn - dt / 26);
    }
    let burnt = 0;
    for (const f of this.flowers) { const k = (f.y / GC | 0) * gw + (f.x / GC | 0); if (heat[k] > 0.25 && f.burn === 0 && f.g > 0.5) { f.burn = 1; f.g = 0; burnt++; w.stats.words++; } else if (f.g < 1) f.g = Math.min(1, f.g + dt / 18); if (f.burn > 0 && f.g > 0.5) f.burn = 0; }
    if (burnt && w.time - this.lastCrackle > 0.1) { this.lastCrackle = w.time; w.sound.crackle(1, clamp(hot[0] ? hot[0].x / w.W * 2 - 1 : 0, -1, 1)); }
    const night = this.dark;
    for (const q of this.flyers) {
      if ((q.k === 'fly') !== night) continue;
      let fx = 0, fy = 0; for (const d of w.dragons) { const h = d.headPos, dd = Math.hypot(q.x - h.x, q.y - h.y); if (dd < d.L * 0.22) { fx += (q.x - h.x) / dd; fy += (q.y - h.y) / dd; } }
      for (const h of hot) { const d = Math.hypot(q.x - h.x, q.y - h.y); if (d < 200) { fx += (q.x - h.x) / d * 1.5; fy += (q.y - h.y) / d * 1.5; break; } }
      q.t -= dt; let tx, ty;
      if (q.k === 'bee' && this.flowers.length) { if (q.t <= 0 || !q.f || q.f.g < 0.8) { q.t = rr(4, 8); q.f = this.flowers[Math.random() * this.flowers.length | 0]; } tx = q.f.x + Math.sin(w.time * 2.2 + q.ph) * 34 * this.u; ty = q.f.y - q.f.h + Math.sin(w.time * 4.4 + q.ph) * 16 * this.u; }
      else { tx = q.x + Math.cos(q.a) * 50; ty = q.y + Math.sin(q.a) * 50; }
      let aim = Math.atan2(ty - q.y, tx - q.x); if (fx || fy) aim = Math.atan2(fy, fx);
      let df = aim - q.a; df = Math.atan2(Math.sin(df), Math.cos(df)); q.a += clamp(df, -5 * dt, 5 * dt) + (q.k !== 'bee' ? (noise2(q.ph + w.time * 0.7, 1, 2) - 0.5) * 6 * dt : 0);
      const sp = (q.k === 'bee' ? 70 : q.k === 'bf' ? 42 : 26) * ((fx || fy) ? 2.6 : 1) * this.u; q.x += Math.cos(q.a) * sp * dt; q.y += Math.sin(q.a) * sp * dt;
      if (q.x < -20 || q.x > this.W + 20 || q.y < -20 || q.y > this.H + 20) q.a = Math.atan2(this.H / 2 - q.y, this.W / 2 - q.x);
    }
  }
  draw(g, T) {
    const W = this.W, H = this.H, GC = this.GC, gw = this.gw, ash = this.ash, P = this.dark ? NIGHT : DAY, t = this.world.time, u = this.u;
    g.imageSmoothingEnabled = true; g.drawImage(this.groundC, 0, 0, W, H);
    for (let j = 0; j < this.gh; j++) for (let i = 0; i < gw; i++) { const a = ash[j * gw + i]; if (a > 0.03) { g.fillStyle = `rgba(${this.dark ? '2,4,3' : '36,28,22'},${a * 0.55})`; g.beginPath(); g.arc(i * GC + 6, j * GC + 6, 9, 0, TAU); g.fill(); } }
    const paths = P.shades.map(() => new Path2D()), burnt = new Path2D();
    for (const b of this.blades) {
      const sway = Math.sin(t * 1.4 + b.x * 0.02 + b.ph) * 3, hh = b.h * (1 - b.burn * 0.65), f = b.flat;
      const sx = b.x + b.lean + sway, sy = b.y - hh, fx = b.x + Math.cos(b.fa) * hh * 0.85, fy = b.y + Math.sin(b.fa) * hh * 0.35 - hh * 0.08;
      const tx = lerp(sx, fx, f), ty = lerp(sy, fy, f), cx = lerp(b.x + b.lean * 0.3, (b.x + tx) / 2, f), cy = lerp(b.y - hh * 0.55, Math.min(b.y, ty) - hh * 0.2, f);
      const p = b.burn > 0.5 ? burnt : paths[b.c]; p.moveTo(b.x, b.y); p.quadraticCurveTo(cx, cy, tx, ty);
    }
    g.lineCap = 'round'; g.lineWidth = 1.7 * Math.max(0.8, u); paths.forEach((p, i) => { g.strokeStyle = P.shades[i]; g.stroke(p); }); g.strokeStyle = P.char; g.stroke(burnt);
    const dk = this.dark ? 0.62 : 1;
    for (const f of this.flowers) {
      const gg = f.g, sway = Math.sin(t * 1.3 + f.ph) * 4, hx = f.x + sway * gg, hy = f.y - f.h * gg;
      g.strokeStyle = f.burn > 0 ? P.char : P.stem; g.lineWidth = 2.6; g.beginPath(); g.moveTo(f.x, f.y); g.quadraticCurveTo(f.x, f.y - f.h * gg * 0.5, hx, hy); g.stroke();
      if (f.burn > 0 || gg < 0.3) continue; const r = 7 * u * gg, [bh, bs, bl] = f.bloom;
      g.fillStyle = hsl(bh, bs, bl * dk); g.strokeStyle = 'rgba(30,18,12,.4)'; g.lineWidth = 1;
      for (let i = 0; i < f.n; i++) { const a = i / f.n * TAU + t * 0.1; g.beginPath(); g.ellipse(hx + Math.cos(a) * r, hy + Math.sin(a) * r, r * 0.95, r * 0.6, a, 0, TAU); g.fill(); g.stroke(); }
      g.fillStyle = bh === 48 ? '#c4602a' : hsl(46, 0.9, 0.55 * dk); g.beginPath(); g.arc(hx, hy, r * 0.55, 0, TAU); g.fill();
    }
    // night: the whole meadow sinks a little into blue
    if (this.dark) { g.fillStyle = 'rgba(8,16,40,.22)'; g.fillRect(0, 0, W, H); }
  }
  drawTop(g, T) {
    const w = this.world, night = this.dark, u = this.u, t = w.time;
    for (const q of this.flyers) {
      if ((q.k === 'fly') !== night) continue;
      g.save(); g.translate(q.x, q.y); const flap = Math.abs(Math.sin(t * (q.k === 'bee' ? 40 : 12) + q.ph));
      if (q.k === 'fly') { const a = 0.45 + 0.55 * Math.max(0, Math.sin(t * 1.6 + q.ph * 3)); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.drawImage(FIREFLY, -14 * u, -14 * u, 28 * u, 28 * u); g.fillStyle = '#f4ffc0'; g.beginPath(); g.arc(0, 0, 1.6 * u, 0, TAU); g.fill(); }
      else if (q.k === 'bee') {
        g.rotate(q.a); g.fillStyle = 'rgba(255,255,255,.65)'; g.strokeStyle = 'rgba(80,80,80,.4)'; g.lineWidth = 0.8;
        for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(-1, sd * 4 * u * (0.4 + flap * 0.6), 5 * u, 2.6 * u, sd * 0.5, 0, TAU); g.fill(); g.stroke(); }
        g.fillStyle = '#f2b81c'; g.strokeStyle = '#2a1c08'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, 0, 6.5 * u, 4 * u, 0, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#2a1c08'; g.fillRect(-2 * u, -3.6 * u, 1.6 * u, 7.2 * u); g.fillRect(1.4 * u, -3.4 * u, 1.6 * u, 6.8 * u); g.beginPath(); g.arc(6.5 * u, 0, 2.2 * u, 0, TAU); g.fill();
      } else {
        g.rotate(q.a + PI / 2); const s = 9 * u, open = 0.15 + 0.85 * flap;
        for (const sd of [-1, 1]) { g.save(); g.scale(sd * open, 1); g.fillStyle = `hsl(${q.hue},75%,60%)`; g.strokeStyle = 'rgba(40,24,16,.8)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, -s * 0.2); g.bezierCurveTo(s * 0.5, -s * 1.6, s * 1.9, -s * 1.3, s * 1.6, -s * 0.2); g.bezierCurveTo(s * 1.2, s * 0.2, s * 0.4, s * 0.1, 0, 0); g.fill(); g.stroke();
          g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(s * 1.0, 0, s * 1.3, s * 0.7, s * 0.8, s * 1.1); g.bezierCurveTo(s * 0.4, s * 1.1, s * 0.1, s * 0.6, 0, 0.3); g.fillStyle = `hsl(${q.hue + 20},80%,70%)`; g.fill(); g.stroke(); g.restore(); }
        g.strokeStyle = '#2a1810'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -s * 0.6); g.lineTo(0, s * 0.6); g.stroke();
      }
      g.restore();
    }
  }
}

// ====================================================================================================
// Weather
// ====================================================================================================
export class Weather extends Backdrop {
  constructor(world) { super(world); this.mode = 'rain'; this.fogK = 0; this.rainK = 0; this.windX = 0; this.windY = 0; this.sizzles = 0; }
  setMode(m) { this.mode = m; }
  build() {
    const W = this.W, H = this.H, CS = this.CS = 8; this.gw = Math.ceil(W / CS); this.gh = Math.ceil(H / CS); const n = this.gw * this.gh;
    this.heat = new Float32Array(n); this.char = new Float32Array(n); this.wet = new Float32Array(n);
    this.small = document.createElement('canvas'); this.small.width = this.gw; this.small.height = this.gh; this.sctx = this.small.getContext('2d'); this.imgd = this.sctx.createImageData(this.gw, this.gh);
    this.drops = []; this.ripples = []; this.smoke = []; this.sizzles = 0;
    this.streaks = Array.from({ length: 46 }, () => ({ x: rr(0, W), y: rr(0, H), len: rr(40, 120), v: rr(0.7, 1.4), ph: Math.random() * 9 }));
    this.blobs = Array.from({ length: 34 }, () => ({ x: rr(0, W), y: rr(0, H), r: rr(150, 300) * this.u, a: rr(0.35, 0.6), vx: rr(6, 18), vy: rr(-4, 4) }));
    const mk = () => { const c = document.createElement('canvas'); c.width = Math.ceil(W / 2); c.height = Math.ceil(H / 2); return c; };
    this.fogC = mk(); this.fogX = this.fogC.getContext('2d'); this.memC = mk(); this.memX = this.memC.getContext('2d');
    this.lastBlip = 0;
  }
  update(dt) {
    const w = this.world, m = this.mode, hot = w.hot, CS = this.CS, gw = this.gw, gh = this.gh, heat = this.heat, char = this.char, wet = this.wet, n = gw * gh, t = w.time;
    this.windX = (m === 'wind' ? 1 : 0.12) * (110 + 80 * Math.sin(t * 0.35) + 60 * (fbm(t * 0.3, 2, 1, 2) - 0.5)); this.windY = (m === 'wind' ? 0.25 : 0) * 30 * Math.sin(t * 0.5);
    w.particles.windX = this.windX; w.particles.windY = this.windY;
    this.fogK += ((m === 'fog' ? 1 : 0) - this.fogK) * Math.min(1, dt * 1.5); this.rainK += ((m === 'rain' ? 1 : 0) - this.rainK) * Math.min(1, dt * 1.5);
    for (const h of hot) { const i0 = Math.max(0, (h.x - h.r) / CS | 0), i1 = Math.min(gw - 1, (h.x + h.r) / CS | 0), j0 = Math.max(0, (h.y - h.r) / CS | 0), j1 = Math.min(gh - 1, (h.y + h.r) / CS | 0);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const f = 1 - Math.hypot(i * CS - h.x, j * CS - h.y) / h.r; if (f > 0) { const k = j * gw + i; heat[k] = Math.max(heat[k], f * h.p); char[k] = Math.min(1, char[k] + dt * 0.9 * f * h.p); } } }
    for (let k = 0; k < n; k++) {
      if (heat[k] > 0) { if (heat[k] > 0.3 && this.smoke.length < 450 && Math.random() < dt * heat[k] * 1.6) this.smoke.push({ x: (k % gw) * CS + rr(0, CS), y: (k / gw | 0) * CS, vx: 0, vy: -rr(14, 30), age: 0, life: rr(2.2, 4), s: rr(14, 26) * this.u });
        heat[k] = Math.max(0, heat[k] - dt * 0.38 * (1 + wet[k])); }
      if (char[k] > 0) char[k] = Math.max(0, char[k] - dt / 90); if (wet[k] > 0) wet[k] = Math.max(0, wet[k] - dt / 14);
    }
    if (m === 'rain') { const c = w.W * w.H / 12000 * dt; for (let i = 0; i < c + (Math.random() < c % 1 ? 1 : 0); i++) this.drops.push({ x: rr(0, w.W), y: rr(0, w.H), z: 1, sp: rr(1.8, 2.6) }); }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.z -= dt * d.sp; if (d.z > 0) continue; this.drops.splice(i, 1);
      const k = clamp(d.y / CS | 0, 0, gh - 1) * gw + clamp(d.x / CS | 0, 0, gw - 1);
      if (heat[k] > 0.1) { this.sizzles++; for (let s = 0; s < 3; s++) this.smoke.push({ x: d.x + rr(-6, 6), y: d.y, vx: rr(-10, 10), vy: -rr(24, 50), age: 0, life: rr(0.7, 1.4), s: rr(8, 14) * this.u, steam: true }); heat[k] *= 0.4;
        if (w.time - this.lastBlip > 0.05 && Math.random() < 0.5) { this.lastBlip = w.time; w.sound.crackle(0.5, clamp(d.x / w.W * 2 - 1, -1, 1)); } }
      else { this.ripples.push({ x: d.x, y: d.y, age: 0 }); wet[k] = Math.min(1, wet[k] + 0.4); }
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) { this.ripples[i].age += dt; if (this.ripples[i].age > 0.9) this.ripples.splice(i, 1); }
    for (let i = this.smoke.length - 1; i >= 0; i--) { const s = this.smoke[i]; s.age += dt; s.vx += (this.windX * 0.8 - s.vx) * Math.min(1, dt * 0.8); s.vy += (this.windY - 14 - s.vy) * Math.min(1, dt * 0.4); s.x += s.vx * dt; s.y += s.vy * dt; if (s.age > s.life) this.smoke.splice(i, 1); }
    for (const s of this.streaks) { s.x += this.windX * s.v * 2 * dt; s.y += this.windY * s.v * dt; if (s.x > this.W + 100) { s.x = -100; s.y = rr(0, this.H); } }
    const pts = bodyPoints(w, 4);
    for (const b of this.blobs) {
      b.x += (b.vx + this.windX * 0.15) * dt; b.y += b.vy * dt; if (b.x - b.r > this.W) b.x = -b.r; if (b.y < -b.r) b.y = this.H + b.r; if (b.y > this.H + b.r) b.y = -b.r;
      for (const p of pts) { const d = Math.hypot(b.x - p[0], b.y - p[1]), lim = b.r * 0.7; if (d < lim && d > 1) { b.x += (b.x - p[0]) / d * (lim - d) * dt * 2; b.y += (b.y - p[1]) / d * (lim - d) * dt * 2; } }
    }
  }
  draw(g, T) {
    const w = this.world, d = this.imgd.data, gw = this.gw, gh = this.gh, heat = this.heat, char = this.char, wet = this.wet, CS = this.CS, dk = T.dark;
    g.drawImage(w.paperC, 0, 0, this.W, this.H);
    const cr = dk ? 6 : 28, cg = dk ? 5 : 20, cb = dk ? 4 : 16, wr = dk ? 90 : 60, wg = dk ? 110 : 80, wb = dk ? 150 : 120;
    for (let k = 0, n = gw * gh; k < n; k++) {
      const c = char[k], h = heat[k], wt = wet[k]; let r = 0, gg = 0, b = 0, a = 0;
      if (wt > 0.02) { r = wr; gg = wg; b = wb; a = wt * 70; }
      if (c > 0.02) { const na = clamp(c * 1.3, 0, 1) * 235, s = a + na + 1e-6; r = (r * a + cr * na) / s; gg = (gg * a + cg * na) / s; b = (b * a + cb * na) / s; a = a + na * (1 - a / 255); }
      if (h > 0.02) { r = lerp(r, 255, h); gg = lerp(gg, 120 + 60 * h, h); b = lerp(b, 20, h); a = Math.max(a, 255 * Math.min(1, h * 1.2)); }
      const o = k * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = Math.min(255, a);
    }
    this.sctx.putImageData(this.imgd, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(this.small, 0, 0, gw * CS, gh * CS);
    if (this.rainK > 0.01) { g.fillStyle = dk ? `rgba(40,60,100,${0.18 * this.rainK})` : `rgba(60,80,110,${0.14 * this.rainK})`; g.fillRect(0, 0, this.W, this.H); }
    g.strokeStyle = dk ? 'rgba(150,180,230,.5)' : 'rgba(70,110,170,.5)'; g.lineWidth = 1;
    for (const r of this.ripples) { const f = r.age / 0.9; g.globalAlpha = 1 - f; g.beginPath(); g.ellipse(r.x, r.y, 3 + f * 14, (3 + f * 14) * 0.45, 0, 0, TAU); g.stroke(); } g.globalAlpha = 1;
    if (this.mode === 'wind') { g.strokeStyle = dk ? 'rgba(200,215,240,.16)' : 'rgba(60,80,110,.2)'; g.lineWidth = 1.2; g.lineCap = 'round'; const tt = w.time;
      for (const s of this.streaks) { g.beginPath(); g.moveTo(s.x, s.y); g.quadraticCurveTo(s.x + s.len * 0.5, s.y + Math.sin(tt + s.ph) * 8, s.x + s.len, s.y + this.windY * 0.3); g.stroke(); } }
  }
  drawTop(g, T) {
    const w = this.world, dk = T.dark;
    for (const s of this.smoke) { const f = s.age / s.life, sz = s.s * (1 + f * 2.2); g.globalAlpha = (s.steam ? 0.7 : 0.55) * (1 - f) * Math.min(1, s.age * 4); g.drawImage(s.steam ? STEAM : dk ? SMOKE_D : SMOKE_L, s.x - sz, s.y - sz, sz * 2, sz * 2); } g.globalAlpha = 1;
    if (this.rainK > 0.02) { g.strokeStyle = dk ? `rgba(170,195,240,${0.5 * this.rainK})` : `rgba(70,100,150,${0.55 * this.rainK})`; g.lineWidth = 1.3; g.lineCap = 'round'; const L = 20 * this.u; g.beginPath();
      for (const d of this.drops) { const hz = d.z * 300 * this.u, x = d.x - this.windX * 0.06 * d.z; g.moveTo(x, d.y - hz); g.lineTo(x - this.windX * 0.012, d.y - hz + L); } g.stroke(); }
    if (this.fogK > 0.01) {
      const mx = this.memX, fx = this.fogX, MIST = dk ? MIST_D : MIST_L, pts = bodyPoints(w, 2, 3);
      mx.globalCompositeOperation = 'destination-out'; mx.fillStyle = 'rgba(0,0,0,.05)'; mx.fillRect(0, 0, this.memC.width, this.memC.height); mx.globalCompositeOperation = 'source-over'; mx.globalAlpha = 0.28;
      for (const p of pts) { const r = 70 * this.u + p[2] * 2.2; mx.drawImage(SOFT, (p[0] - r) / 2, (p[1] - r) / 2, r, r); }
      for (const h of w.hot) { const r = h.r * 6; mx.drawImage(SOFT, (h.x - r) / 2, (h.y - r) / 2, r, r); } mx.globalAlpha = 1;
      fx.globalCompositeOperation = 'source-over'; fx.clearRect(0, 0, this.fogC.width, this.fogC.height);
      for (const b of this.blobs) { fx.globalAlpha = b.a; fx.drawImage(MIST, (b.x - b.r) / 2, (b.y - b.r) / 2, b.r, b.r); }
      fx.globalAlpha = 1; fx.globalCompositeOperation = 'destination-out'; fx.drawImage(this.memC, 0, 0);
      g.globalAlpha = this.fogK * (dk ? 0.7 : 1); g.drawImage(this.fogC, 0, 0, this.W, this.H); g.globalAlpha = 1;
    }
  }
}

export const BACKDROPS = { garden: Garden, weather: Weather };
