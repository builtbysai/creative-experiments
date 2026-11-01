// Fire, flame, spark, ember, ash and smoke. Sprites are pre-rendered per flame hue, so a green dragon breathes green fire.

import { TAU, clamp, rr } from './util.js';

const spriteCache = new Map();
function radial(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
/** Sprite set for one flame hue (degrees), cached by 6-degree bucket. */
export function flameSprites(hue) {
  const key = Math.round(((hue % 360) + 360) % 360 / 6);
  let s = spriteCache.get(key);
  if (!s) {
    const h = key * 6, c = (dh, sat, l, a) => `hsla(${h + dh},${sat}%,${l}%,${a})`;
    s = {
      core: radial([[0, c(17, 100, 90, 1)], [0.45, c(14, 100, 76, 0.7)], [1, c(10, 100, 62, 0)]]),
      mid: radial([[0, c(2, 100, 62, 1)], [0.5, c(0, 100, 52, 0.6)], [1, c(-4, 100, 48, 0)]]),
      edge: radial([[0, c(-14, 80, 52, 0.9)], [0.5, c(-18, 75, 42, 0.45)], [1, c(-22, 80, 30, 0)]]),
      glow: radial([[0, c(12, 100, 72, 1)], [0.35, c(2, 100, 58, 0.45)], [1, c(-4, 100, 50, 0)]]),
      spark: c(14, 100, 78, 1), sparkDark: c(0, 100, 52, 1), ember1: c(8, 100, 66, 1), ember2: c(-8, 100, 52, 1)
    };
    spriteCache.set(key, s);
  }
  return s;
}
const SMOKE = radial([[0, 'rgba(96,86,78,.55)'], [1, 'rgba(96,86,78,0)']]);

export class Particles {
  constructor() { this.list = []; this.cap = 2600; this.fireX = 0; this.fireY = 0; this.fireW = 0; }

  clear() { this.list.length = 0; }
  push(q) { if (this.list.length < this.cap) this.list.push(q); }

  fire(x, y, vx, vy, life, size, hue, u) { this.push({ k: 'fire', x, y, vx, vy, life, age: 0, size, hue, u }); }
  flame(x, y, vx, vy, life, size, hue, u) { this.push({ k: 'flame', x, y, vx, vy, life, age: 0, size, hue, u }); }
  spark(x, y, vx, vy, life, hue, u = 1) { this.push({ k: 'spark', x, y, vx, vy, life, age: 0, hue, u }); }
  ember(x, y, vx, vy, life, hue, u) { this.push({ k: 'ember', x, y, vx, vy, life, age: 0, rot: Math.random() * 6, hue, u }); }
  smoke(x, y, vx, vy, life, size) { this.push({ k: 'smoke', x, y, vx, vy, life, age: 0, size }); }
  ash(x, y, u) { this.push({ k: 'ash', x, y, vx: rr(-10, 10), vy: -rr(1, 3) * u, life: rr(1.6, 3), age: 0, rot: Math.random() * 6, vr: rr(-4, 4), s: rr(1.2, 2.6), u }); }

  /** @param onFire called for each live breath particle, so the world can set words and paper alight */
  update(dt, clock, onFire) {
    const L = this.list;
    this.fireX = 0; this.fireY = 0; this.fireW = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      q.age += dt;
      if (q.age >= q.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const f = q.age / q.life, u = q.u || 1;
      switch (q.k) {
        case 'fire': {
          const dr = Math.exp(-dt * 1.5); q.vx *= dr; q.vy *= dr; q.vy -= dt * u * 2;
          q.x += q.vx * dt; q.y += q.vy * dt;
          const w = 1 - f; this.fireX += q.x * w; this.fireY += q.y * w; this.fireW += w;
          if (q.age > 0.03 && onFire) onFire(q, dt);
          break;
        }
        case 'spark': q.vx *= Math.exp(-dt * 1.2); q.vy *= Math.exp(-dt * 1.2); q.vy += dt * (q.u || 1) * 3; q.x += q.vx * dt; q.y += q.vy * dt; break;
        case 'flame': q.vx *= Math.exp(-dt * 2); q.x += q.vx * dt; q.y += q.vy * dt; break;
        case 'ember':
          q.vx += Math.sin(clock * 5 + q.rot) * 22 * dt; q.vy -= dt * u * 0.9; q.vx *= Math.exp(-dt * 0.6); q.vy *= Math.exp(-dt * 0.5);
          q.x += q.vx * dt; q.y += q.vy * dt; break;
        case 'ash':
          q.vx += Math.sin(clock * 3 + q.rot) * 6 * dt; q.vy += (f < 0.35 ? -u * 0.6 : u * 1.1) * dt;
          q.vx *= Math.exp(-dt * 0.8); q.vy *= Math.exp(-dt * 0.9);
          q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; break;
        case 'smoke': q.vx *= Math.exp(-dt); q.vy *= Math.exp(-dt * 0.6); q.x += q.vx * dt; q.y += q.vy * dt; break;
      }
    }
    if (this.fireW > 0) { this.fireX /= this.fireW; this.fireY /= this.fireW; }
  }

  draw(g, theme, clock) {
    const add = theme.blend, dark = theme.dark;
    const L = this.list;
    for (const q of L) {
      const f = q.age / q.life;
      if (q.k === 'fire' || q.k === 'flame') {
        const sp = flameSprites(q.hue ?? 28), img = f < 0.22 ? sp.core : f < 0.6 ? sp.mid : sp.edge;
        const s = q.size * (0.5 + 1.5 * f) * (q.k === 'flame' ? 1.3 : 1);
        g.globalCompositeOperation = add;
        g.globalAlpha = Math.pow(1 - f, 0.9) * (q.k === 'flame' ? 0.75 : dark ? 0.5 : 0.8);
        g.drawImage(img, q.x - s, q.y - s, s * 2, s * 2);
      } else if (q.k === 'smoke') {
        const s = q.size * (1 + f * 2.2);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = (1 - f) * (dark ? 0.5 : 0.7);
        g.drawImage(SMOKE, q.x - s, q.y - s, s * 2, s * 2);
      }
    }
    g.globalCompositeOperation = add; g.lineCap = 'round';
    for (const q of L) {
      const f = q.age / q.life;
      if (q.k === 'spark') {
        const sp = flameSprites(q.hue ?? 28);
        g.globalAlpha = (1 - f) * 0.9; g.strokeStyle = dark ? sp.spark : sp.sparkDark; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035); g.stroke();
      } else if (q.k === 'ember') {
        const sp = flameSprites(q.hue ?? 28), fl = 0.65 + 0.35 * Math.sin(clock * 22 + q.rot * 4);
        g.globalAlpha = (1 - f) * fl; g.fillStyle = f < 0.5 ? sp.ember1 : sp.ember2;
        g.beginPath(); g.arc(q.x, q.y, 1.5 + 1.3 * (1 - f), 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (const q of L) {
      if (q.k !== 'ash') continue;
      const f = q.age / q.life;
      g.globalAlpha = (1 - f) * 0.85; g.fillStyle = theme.ash;
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.fillRect(-q.s, -q.s * 0.45, q.s * 2, q.s * 0.9); g.restore();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /** Soft light thrown by the breath itself. */
  drawBloom(g, theme, unit, hue) {
    if (this.fireW <= 0) return;
    const sp = flameSprites(hue), s = unit * 0.42;
    g.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
    g.globalAlpha = (theme.dark ? 0.14 : 0.1) * clamp(this.fireW / 40, 0, 1);
    g.drawImage(sp.glow, this.fireX - s, this.fireY - s, s * 2, s * 2);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}
