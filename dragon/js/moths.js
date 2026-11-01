// Moths: small, silly, and drawn to flame. They drift over the page, rest on words, and flutter up when a dragon
// walks near. A flame (the breath, burning paper, a burning word) draws them in; get too close and they catch fire,
// fall as embers, and a fresh moth wanders in from the edge a few seconds later. They give the dragons something to
// chase and the player something to aim at.

import { TAU, clamp, rr, noise2 } from './util.js';
import { flameSprites } from './particles.js';

export class Moths {
  constructor(world) { this.world = world; this.list = []; this.burnt = 0; this.respawn = []; }

  /** How many moths the page holds, by its size. */
  get want() { const w = this.world; return clamp(Math.round(w.W * w.H / 150000), 3, 7); }

  reset() { this.list.length = 0; this.respawn.length = 0; }

  spawn(edge = true) {
    const w = this.world, side = Math.random() * 4 | 0;
    let x = rr(0.1, 0.9) * w.W, y = rr(0.1, 0.9) * w.H;
    if (edge) { if (side === 0) x = -10; else if (side === 1) x = w.W + 10; else if (side === 2) y = -10; else y = w.H + 10; }
    const a = Math.atan2(w.H / 2 - y, w.W / 2 - x) + rr(-0.5, 0.5);
    this.list.push({ x, y, a, v: rr(30, 55), ph: Math.random() * TAU, seed: Math.random() * 100, rest: 0, burn: -1, size: rr(0.8, 1.15), tone: Math.random(), vy: 0, vx: 0 });
  }

  nearest(x, y) {
    let best = null, bd = 1e9;
    for (const m of this.list) if (m.burn < 0) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
    return best ? { moth: best, d: bd } : null;
  }

  update(dt, clock) {
    const w = this.world, P = w.particles, paper = w.paper, u = w.unit;
    while (this.list.length + this.respawn.length < this.want) this.spawn(this.list.length > 1);
    for (let i = this.respawn.length - 1; i >= 0; i--) { this.respawn[i] -= dt; if (this.respawn[i] <= 0) { this.respawn.splice(i, 1); this.spawn(true); } }
    const flameOn = P.fireW > 4;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      m.ph += dt * (m.rest > 0 ? 2 : 38);
      if (m.burn >= 0) {                                    // falling, burning
        m.burn += dt; m.vy += dt * 90; m.x += m.vx * dt; m.y += m.vy * dt; m.vx *= Math.exp(-dt * 2);
        if (Math.random() < dt * 30) P.spark(m.x, m.y, rr(-20, 20), rr(-30, 10), rr(0.3, 0.6), 28, u);
        if (m.burn > 0.7) { P.ember(m.x, m.y, rr(-8, 8), -rr(2, 6), rr(1, 2), 28, u); P.ash(m.x, m.y, u); this.list.splice(i, 1); this.respawn.push(rr(2.5, 5)); }
        continue;
      }
      // what draws it, and what scares it
      let tx = 0, ty = 0, pull = 0;
      if (flameOn) { const dx = P.fireX - m.x, dy = P.fireY - m.y, d = Math.hypot(dx, dy); if (d < w.baseL * 0.9) { tx += dx / d; ty += dy / d; pull = 1; } }
      for (const dg of w.dragons) {
        const h = dg.headPos, dx = m.x - h.x, dy = m.y - h.y, d = Math.hypot(dx, dy);
        if (d < dg.L * 0.2) { tx += dx / d * 2.2; ty += dy / d * 2.2; m.rest = 0; }
      }
      // a resting moth sits on its word until something comes close
      if (m.rest > 0) { m.rest -= dt; if (!(pull || tx || ty) && m.rest > 0) continue; m.rest = 0; }
      // flutter: heading wanders, speed pulses with each wingbeat
      const turn = (noise2(m.seed + clock * 0.9, m.seed, 3) - 0.5) * 7 + Math.sin(m.ph * 0.7) * 1.2;
      let a = m.a + turn * dt;
      if (tx || ty) { const want = Math.atan2(ty, tx); let df = want - a; df = Math.atan2(Math.sin(df), Math.cos(df)); a += df * Math.min(1, dt * (pull ? 2.2 : 5)); }
      // a gentle pull back onto the page
      const mx = w.W * 0.5 - m.x, my = w.H * 0.5 - m.y;
      if (m.x < 0 || m.x > w.W || m.y < 0 || m.y > w.H) { const df = Math.atan2(Math.sin(Math.atan2(my, mx) - a), Math.cos(Math.atan2(my, mx) - a)); a += df * Math.min(1, dt * 1.5); }
      m.a = a;
      const sp = (m.v * (pull ? 1.5 : 1) + 22 * Math.sin(m.ph)) * (0.9 + 0.1 * m.size);
      m.x += Math.cos(a) * sp * dt; m.y += Math.sin(a) * sp * dt;
      // settle on a word now and then
      if (!pull && Math.random() < dt * 0.05) { const wd = w.page.randomWord(m.x, m.y, 0, 90); if (wd) { m.x = wd.x; m.y = wd.y - 6; m.rest = rr(2.5, 6); } }
      // catch fire: touched by a hot breath particle or burning paper
      let lit = paper.enabled && paper.flameAt(m.x, m.y);
      if (!lit) for (const q of P.list) if (q.k === 'fire' && q.age > 0.03 && q.age / q.life < 0.8 && Math.hypot(q.x - m.x, q.y - m.y) < q.size * (1 + q.age / q.life) * 1.1) { lit = true; break; }
      if (lit) { m.burn = 0; m.vx = Math.cos(m.a) * 30; m.vy = -20; this.burnt++; w.stats.moths++; w.sound.crackle(1, clamp(m.x / w.W * 2 - 1, -1, 1)); }
    }
  }

  draw(g, T) {
    const dark = T.dark;
    for (const m of this.list) {
      const s = this.world.unit * 0.95 * m.size, flap = m.rest > 0 ? 0.55 + 0.1 * Math.sin(m.ph) : Math.abs(Math.cos(m.ph));
      g.save(); g.translate(m.x, m.y); g.rotate(m.burn >= 0 ? m.burn * 9 : m.a + Math.PI / 2);
      if (m.burn >= 0) {
        const sp = flameSprites(28); g.globalCompositeOperation = dark ? 'lighter' : 'source-over'; g.globalAlpha = 0.9 * (1 - m.burn / 0.8);
        g.drawImage(sp.glow, -s * 2.2, -s * 2.2, s * 4.4, s * 4.4); g.globalCompositeOperation = 'source-over';
      }
      const body = dark ? '#d9cdb6' : '#5c4a38', wing = dark ? `hsla(${38 + m.tone * 20},35%,${74 + m.tone * 10}%,0.9)` : `hsla(${28 + m.tone * 14},28%,${48 - m.tone * 10}%,0.92)`;
      const mark = dark ? 'rgba(60,40,20,0.55)' : 'rgba(255,240,210,0.7)';
      g.globalAlpha *= m.burn >= 0 ? 0.9 : 1;
      for (const sd of [-1, 1]) {
        g.save(); g.scale(sd * flap, 1);
        g.fillStyle = wing;
        g.beginPath(); g.moveTo(s * 0.1, -s * 0.35); g.quadraticCurveTo(s * 1.1, -s * 1.25, s * 1.75, -s * 0.2); g.quadraticCurveTo(s * 1.1, s * 0.3, s * 0.1, s * 0.3); g.fill();   // fore wing, swept
        g.beginPath(); g.moveTo(s * 0.1, s * 0.05); g.quadraticCurveTo(s * 1.0, s * 0.05, s * 1.15, s * 0.95); g.quadraticCurveTo(s * 0.5, s * 1.15, s * 0.1, s * 0.55); g.fill();       // hind wing
        g.fillStyle = mark; g.beginPath(); g.arc(s * 1.0, -s * 0.38, s * 0.17, 0, TAU); g.fill();
        g.restore();
      }
      g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, s * 0.2, s * 0.62, 0, 0, TAU); g.fill();
      g.strokeStyle = body; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-s * 0.08, -s * 0.55); g.quadraticCurveTo(-s * 0.4, -s * 1.0, -s * 0.6, -s * 0.95); g.moveTo(s * 0.08, -s * 0.55); g.quadraticCurveTo(s * 0.4, -s * 1.0, s * 0.6, -s * 0.95); g.stroke();
      g.restore();
    }
  }
}
