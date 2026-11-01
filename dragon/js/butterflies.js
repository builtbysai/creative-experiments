// Butterflies: an optional extra, off until switched on from the dock. They drift over the page, rest on words, and
// flutter up when a dragon walks near. A flame (the breath, burning paper, a burning word) draws them in; get too
// close and they catch fire, fall as embers, and a fresh one wanders in from the edge a few seconds later. They give
// the dragons something to chase and the player something to aim at.

import { TAU, clamp, rr, noise2 } from './util.js';
import { flameSprites } from './particles.js';

export class Butterflies {
  constructor(world) { this.world = world; this.list = []; this.respawn = []; }

  /** How many the page holds, by its size. None while switched off. */
  get want() { const w = this.world; return w.butterfliesOn ? clamp(Math.round(w.W * w.H / 150000), 3, 7) : 0; }

  reset() { this.list.length = 0; this.respawn.length = 0; }

  spawn(edge = true) {
    const w = this.world, side = Math.random() * 4 | 0;
    let x = rr(0.1, 0.9) * w.W, y = rr(0.1, 0.9) * w.H;
    if (edge) { if (side === 0) x = -10; else if (side === 1) x = w.W + 10; else if (side === 2) y = -10; else y = w.H + 10; }
    const a = Math.atan2(w.H / 2 - y, w.W / 2 - x) + rr(-0.5, 0.5);
    this.list.push({ x, y, a, v: rr(30, 55), ph: Math.random() * TAU, seed: Math.random() * 100, rest: 0, burn: -1, size: rr(0.85, 1.2), hue: [8, 28, 48, 200, 285, 330][Math.random() * 6 | 0] + rr(-8, 8), leave: -1, vy: 0, vx: 0 });
  }

  nearest(x, y) {
    let best = null, bd = 1e9;
    for (const b of this.list) if (b.burn < 0 && b.leave < 0) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
    return best ? { bf: best, d: bd } : null;
  }

  update(dt, clock) {
    const w = this.world, P = w.particles, paper = w.paper, u = w.unit, want = this.want;
    if (want === 0) { for (const b of this.list) if (b.leave < 0 && b.burn < 0) b.leave = 0; this.respawn.length = 0; }
    else while (this.list.length + this.respawn.length < want) this.spawn(this.list.length > 1);
    for (let i = this.respawn.length - 1; i >= 0; i--) { this.respawn[i] -= dt; if (this.respawn[i] <= 0) { this.respawn.splice(i, 1); this.spawn(true); } }
    const flameOn = P.fireW > 4;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.ph += dt * (b.rest > 0 ? 2.2 : 14);
      if (b.burn >= 0) {                                    // falling, burning
        b.burn += dt; b.vy += dt * 90; b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= Math.exp(-dt * 2);
        if (Math.random() < dt * 30) P.spark(b.x, b.y, rr(-20, 20), rr(-30, 10), rr(0.3, 0.6), 28, u);
        if (b.burn > 0.7) { P.ember(b.x, b.y, rr(-8, 8), -rr(2, 6), rr(1, 2), 28, u); P.ash(b.x, b.y, u); this.list.splice(i, 1); this.respawn.push(rr(2.5, 5)); }
        continue;
      }
      if (b.leave >= 0) {                                   // switched off: it flutters away and fades
        b.leave += dt; b.rest = 0; b.x += Math.cos(b.a) * 120 * dt; b.y += Math.sin(b.a) * 120 * dt - 30 * dt;
        if (b.leave > 1.4) this.list.splice(i, 1);
        continue;
      }
      // what draws it, and what scares it
      let tx = 0, ty = 0, pull = 0;
      if (flameOn) { const dx = P.fireX - b.x, dy = P.fireY - b.y, d = Math.hypot(dx, dy); if (d < w.baseL * 0.9) { tx += dx / d; ty += dy / d; pull = 1; } }
      for (const dg of w.dragons) {
        const h = dg.headPos, dx = b.x - h.x, dy = b.y - h.y, d = Math.hypot(dx, dy);
        if (d < dg.L * 0.2) { tx += dx / d * 2.2; ty += dy / d * 2.2; b.rest = 0; }
      }
      // a resting butterfly sits on its word until something comes close
      if (b.rest > 0) { b.rest -= dt; if (!(pull || tx || ty) && b.rest > 0) continue; b.rest = 0; }
      // flutter: heading wanders, speed pulses with each wingbeat
      const turn = (noise2(b.seed + clock * 0.6, b.seed, 3) - 0.5) * 5 + Math.sin(b.ph * 0.5) * 0.8;
      let a = b.a + turn * dt;
      if (tx || ty) { const aim = Math.atan2(ty, tx); let df = aim - a; df = Math.atan2(Math.sin(df), Math.cos(df)); a += df * Math.min(1, dt * (pull ? 2.2 : 5)); }
      if (b.x < 0 || b.x > w.W || b.y < 0 || b.y > w.H) { const to = Math.atan2(w.H * 0.5 - b.y, w.W * 0.5 - b.x); let df = to - a; df = Math.atan2(Math.sin(df), Math.cos(df)); a += df * Math.min(1, dt * 1.5); }
      b.a = a;
      const sp = (b.v * (pull ? 1.5 : 1) + 18 * Math.sin(b.ph)) * (0.9 + 0.1 * b.size);
      b.x += Math.cos(a) * sp * dt; b.y += Math.sin(a) * sp * dt;
      // settle on a word now and then
      if (!pull && Math.random() < dt * 0.05) { const wd = w.page.randomWord(b.x, b.y, 0, 90); if (wd) { b.x = wd.x; b.y = wd.y - 6; b.rest = rr(2.5, 6); } }
      // catch fire: touched by a hot breath particle or burning paper
      let lit = paper.enabled && paper.flameAt(b.x, b.y);
      if (!lit) for (const q of P.list) if (q.k === 'fire' && q.age > 0.03 && q.age / q.life < 0.8 && Math.hypot(q.x - b.x, q.y - b.y) < q.size * (1 + q.age / q.life) * 1.1) { lit = true; break; }
      if (lit) { b.burn = 0; b.vx = Math.cos(b.a) * 30; b.vy = -20; w.stats.butterflies++; w.sound.crackle(1, clamp(b.x / w.W * 2 - 1, -1, 1)); }
    }
  }

  draw(g, T) {
    const dark = T.dark;
    for (const b of this.list) {
      const s = this.world.unit * 1.05 * b.size, open = b.rest > 0 ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(b.ph)) : 0.12 + 0.88 * Math.abs(Math.cos(b.ph));
      g.save(); g.translate(b.x, b.y); g.rotate(b.burn >= 0 ? b.burn * 9 : b.a + Math.PI / 2);
      g.globalAlpha = b.leave >= 0 ? clamp(1 - b.leave / 1.4, 0, 1) : b.burn >= 0 ? 0.95 : 1;
      if (b.burn >= 0) {
        const sp = flameSprites(28); g.globalCompositeOperation = dark ? 'lighter' : 'source-over'; g.globalAlpha = 0.9 * (1 - b.burn / 0.8);
        g.drawImage(sp.glow, -s * 2.4, -s * 2.4, s * 4.8, s * 4.8); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.95;
      }
      const base = `hsl(${b.hue},${dark ? 80 : 68}%,${dark ? 62 : 52}%)`, tip = `hsl(${b.hue + 18},${dark ? 85 : 75}%,${dark ? 78 : 66}%)`, edge = dark ? 'rgba(20,12,8,.8)' : 'rgba(40,24,16,.85)';
      for (const sd of [-1, 1]) {
        g.save(); g.scale(sd * open, 1);
        // upper wing: a rounded sail; lower wing: smaller, with a short tail
        const up = new Path2D(); up.moveTo(s * 0.12, -s * 0.2); up.bezierCurveTo(s * 0.5, -s * 1.5, s * 1.9, -s * 1.5, s * 1.85, -s * 0.5); up.bezierCurveTo(s * 1.8, -s * 0.05, s * 0.8, s * 0.05, s * 0.12, s * 0.05); up.closePath();
        const lo = new Path2D(); lo.moveTo(s * 0.1, 0); lo.bezierCurveTo(s * 1.0, -s * 0.05, s * 1.5, s * 0.5, s * 1.1, s * 1.0); lo.bezierCurveTo(s * 0.9, s * 1.35, s * 0.7, s * 1.5, s * 0.55, s * 1.45); lo.bezierCurveTo(s * 0.45, s * 1.0, s * 0.25, s * 0.6, s * 0.1, s * 0.5); lo.closePath();
        for (const [path, cx, cy, r] of [[up, s * 1.1, -s * 0.6, s * 1.1], [lo, s * 0.7, s * 0.7, s * 0.8]]) {
          const gr = g.createRadialGradient(s * 0.1, 0, 0, cx, cy, r * 1.3);
          gr.addColorStop(0, base); gr.addColorStop(1, tip);
          g.fillStyle = gr; g.fill(path); g.strokeStyle = edge; g.lineWidth = 1.2; g.lineJoin = 'round'; g.stroke(path);
        }
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.beginPath(); g.arc(s * 1.45, -s * 0.85, s * 0.14, 0, TAU); g.arc(s * 1.15, -s * 1.0, s * 0.09, 0, TAU); g.arc(s * 0.85, s * 1.0, s * 0.1, 0, TAU); g.fill();
        g.restore();
      }
      g.fillStyle = edge; g.beginPath(); g.ellipse(0, s * 0.1, s * 0.11, s * 0.7, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(0, -s * 0.62, s * 0.13, 0, TAU); g.fill();
      g.strokeStyle = edge; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-s * 0.04, -s * 0.72); g.quadraticCurveTo(-s * 0.3, -s * 1.15, -s * 0.5, -s * 1.1); g.moveTo(s * 0.04, -s * 0.72); g.quadraticCurveTo(s * 0.3, -s * 1.15, s * 0.5, -s * 1.1); g.stroke();
      g.restore();
    }
  }
}
