// Fire, smoke, sparks, embers and ash.
//
// Fire is modelled on how a flame-thrower or breathing dragon reads on screen: a narrow, fast, bright core at the
// mouth that holds together for a short way, then breaks up into billowing, curling turbulence as it slows, grows
// and cools. Every flame particle carries a temperature that falls with age; colour comes from that temperature
// (white-yellow, yellow, orange, red, dark red), and the cooled tail sometimes leaves a puff of smoke behind.
// Sprites are pre-rendered per flame hue and temperature, so a green dragon breathes green fire.

import { TAU, clamp, rr, noise2 } from './util.js';

const RAMP = 14;                                    // temperature steps per hue
const spriteCache = new Map();

function blob(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

/** Colour of a flame at temperature t (1 = hottest) for a base hue, as [h, s, l]. */
function heatColour(h, t) {
  if (t > 0.82) return [h + 24, 100, 94 - (1 - t) * 40];
  if (t > 0.55) return [h + 14 - (0.82 - t) * 20, 100, 72 - (0.82 - t) * 40];
  if (t > 0.3) return [h + 2, 100, 56 - (0.55 - t) * 56];
  return [h - 10, 80 - (0.3 - t) * 60, 40 - (0.3 - t) * 70];
}

/** Sprites for one flame hue: `ramp[i]` hot to cool, plus glow and spark colours. Cached by 6-degree bucket. */
export function flameSprites(hue) {
  const key = Math.round(((hue % 360) + 360) % 360 / 6);
  let s = spriteCache.get(key);
  if (!s) {
    const h = key * 6, c = (t, a) => { const [H, S, L] = heatColour(h, clamp(t, 0, 1)); return `hsla(${H},${S}%,${Math.max(8, L)}%,${a})`; };
    const ramp = [];
    for (let i = 0; i < RAMP; i++) {
      const t = 1 - i / (RAMP - 1);
      ramp.push(blob([[0, c(t, 1)], [0.3, c(t, 0.9)], [0.6, c(t - 0.22, 0.42)], [1, c(t - 0.4, 0)]]));
    }
    s = {
      ramp,
      glow: blob([[0, c(0.85, 0.9)], [0.35, c(0.5, 0.35)], [1, c(0.3, 0)]]),
      spark: c(0.9, 1), sparkDark: c(0.45, 1), ember1: c(0.6, 1), ember2: c(0.3, 1)
    };
    spriteCache.set(key, s);
  }
  return s;
}
const SMOKE_L = blob([[0, 'rgba(110,92,78,.26)'], [0.6, 'rgba(110,92,78,.1)'], [1, 'rgba(92,84,76,0)']]);
const SMOKE_D = blob([[0, 'rgba(170,160,150,.32)'], [0.6, 'rgba(170,160,150,.12)'], [1, 'rgba(170,160,150,0)']]);

export class Particles {
  constructor() { this.list = []; this.cap = 2200; this.fireX = 0; this.fireY = 0; this.fireW = 0; }

  clear() { this.list.length = 0; }
  push(q) { if (this.list.length < this.cap) this.list.push(q); }

  /** A particle of the breath. `size` is the radius at birth in px, `u` the dragon's unit length. */
  fire(x, y, vx, vy, life, size, hue, u) { this.push({ k: 'fire', x, y, vx, vy, life, age: 0, size, hue, u, heat: rr(0.88, 1), seed: Math.random() * 100 }); }
  flame(x, y, vx, vy, life, size, hue, u) { this.push({ k: 'flame', x, y, vx, vy, life, age: 0, size, hue, u, heat: rr(0.8, 1), seed: Math.random() * 100 }); }
  spark(x, y, vx, vy, life, hue, u = 1) { this.push({ k: 'spark', x, y, vx, vy, life, age: 0, hue, u }); }
  ember(x, y, vx, vy, life, hue, u) { this.push({ k: 'ember', x, y, vx, vy, life, age: 0, rot: Math.random() * 6, hue, u }); }
  smoke(x, y, vx, vy, life, size) { this.push({ k: 'smoke', x, y, vx, vy, life, age: 0, size }); }
  ash(x, y, u) { this.push({ k: 'ash', x, y, vx: rr(-10, 10), vy: -rr(1, 3) * u, life: rr(1.6, 3), age: 0, rot: Math.random() * 6, vr: rr(-4, 4), s: rr(1, 2), u }); }

  /** @param onFire called for each hot breath particle, so the world can set words and paper alight */
  update(dt, clock, onFire) {
    const L = this.list;
    this.fireX = 0; this.fireY = 0; this.fireW = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      q.age += dt;
      if (q.age >= q.life) {
        // a cooled breath particle sometimes leaves smoke
        if (q.k === 'fire' && Math.random() < 0.05) this.smoke(q.x, q.y, q.vx * 0.2, q.vy * 0.2 - 6, rr(1.2, 2), q.size * rr(1.6, 2.4));
        L[i] = L[L.length - 1]; L.pop(); continue;
      }
      const f = q.age / q.life, u = q.u || 1;
      switch (q.k) {
        case 'fire': {
          // turbulence rises with age: the jet's core holds together, the tail billows and curls
          const turb = u * 95 * Math.pow(f, 1.3), sc = 1 / (u * 5);
          q.vx += (noise2(q.x * sc + clock * 0.7, q.y * sc, 3) - 0.5) * 2 * turb * dt;
          q.vy += (noise2(q.x * sc, q.y * sc + clock * 0.7, 9) - 0.5) * 2 * turb * dt - dt * u * 2.5;
          const dr = Math.exp(-dt * 1.7); q.vx *= dr; q.vy *= dr;
          q.x += q.vx * dt; q.y += q.vy * dt;
          const T = q.heat * clamp(1 - f * 1.05, 0, 1);
          if (T > 0.25) { this.fireX += q.x * T; this.fireY += q.y * T; this.fireW += T; if (q.age > 0.04 && onFire) onFire(q, dt); }
          break;
        }
        case 'flame': {
          q.vx += (noise2(q.x * 0.08 + clock * 2, q.y * 0.08, 5) - 0.5) * 60 * dt; q.vx *= Math.exp(-dt * 2); q.vy *= Math.exp(-dt * 0.8);
          q.x += q.vx * dt; q.y += q.vy * dt; break;
        }
        case 'spark': q.vx *= Math.exp(-dt * 1.4); q.vy *= Math.exp(-dt * 1.4); q.vy += dt * u * 3; q.x += q.vx * dt; q.y += q.vy * dt; break;
        case 'ember':
          q.vx += Math.sin(clock * 5 + q.rot) * 18 * dt; q.vy -= dt * u * 0.7; q.vx *= Math.exp(-dt * 0.6); q.vy *= Math.exp(-dt * 0.5);
          q.x += q.vx * dt; q.y += q.vy * dt; break;
        case 'ash':
          q.vx += Math.sin(clock * 3 + q.rot) * 6 * dt; q.vy += (f < 0.35 ? -u * 0.6 : u * 1.1) * dt;
          q.vx *= Math.exp(-dt * 0.8); q.vy *= Math.exp(-dt * 0.9);
          q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; break;
        case 'smoke': q.vx += (noise2(q.x * 0.02 + clock * 0.3, q.y * 0.02, 13) - 0.5) * 30 * dt; q.vx *= Math.exp(-dt); q.vy *= Math.exp(-dt * 0.6); q.x += q.vx * dt; q.y += q.vy * dt; break;
      }
    }
    if (this.fireW > 0) { this.fireX /= this.fireW; this.fireY /= this.fireW; }
  }

  draw(g, theme, clock) {
    const dark = theme.dark, L = this.list;
    // smoke sits under the fire
    g.globalCompositeOperation = 'source-over';
    const smk = dark ? SMOKE_D : SMOKE_L;
    for (const q of L) {
      if (q.k !== 'smoke') continue;
      const f = q.age / q.life, s = q.size * (1 + f * 2.4);
      g.globalAlpha = Math.sin(Math.min(1, f * 5) * 1.57) * (1 - f);
      g.drawImage(smk, q.x - s, q.y - s, s * 2, s * 2);
    }
    g.globalCompositeOperation = theme.blend;
    for (const q of L) {
      if (q.k !== 'fire' && q.k !== 'flame') continue;
      const f = q.age / q.life, T = clamp(1 - f * 1.05, 0, 1) * q.heat, sp = flameSprites(q.hue ?? 28);
      const idx = clamp(Math.round((1 - T) * (RAMP - 1)), 0, RAMP - 1);
      const grow = q.k === 'fire' ? 0.7 + 2.9 * Math.pow(f, 0.8) : 0.8 + 1.1 * f;
      const s = q.size * grow;
      g.globalAlpha = (q.k === 'fire' ? (dark ? 0.55 : 0.78) : 0.7) * Math.min(1, f * 14) * Math.pow(1 - f, 0.7);
      g.drawImage(sp.ramp[idx], q.x - s, q.y - s, s * 2, s * 2);
    }
    g.lineCap = 'round';
    for (const q of L) {
      const f = q.age / q.life;
      if (q.k === 'spark') {
        const sp = flameSprites(q.hue ?? 28);
        g.globalAlpha = (1 - f) * 0.8; g.strokeStyle = dark ? sp.spark : sp.sparkDark; g.lineWidth = 1.1;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); g.stroke();
      } else if (q.k === 'ember') {
        const sp = flameSprites(q.hue ?? 28), fl = 0.6 + 0.4 * Math.sin(clock * 20 + q.rot * 4);
        g.globalAlpha = (1 - f) * fl * 0.9; g.fillStyle = f < 0.5 ? sp.ember1 : sp.ember2;
        g.beginPath(); g.arc(q.x, q.y, 0.9 + 0.9 * (1 - f), 0, TAU); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = theme.ash;
    for (const q of L) {
      if (q.k !== 'ash') continue;
      const f = q.age / q.life;
      g.globalAlpha = (1 - f) * 0.5;
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.fillRect(-q.s, -q.s * 0.4, q.s * 2, q.s * 0.8); g.restore();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /** Soft light thrown by the breath itself. */
  drawBloom(g, theme, unit, hue) {
    if (this.fireW <= 0) return;
    const sp = flameSprites(hue), s = unit * 0.5;
    g.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
    g.globalAlpha = (theme.dark ? 0.16 : 0.12) * clamp(this.fireW / 30, 0, 1);
    g.drawImage(sp.glow, this.fireX - s, this.fireY - s, s * 2, s * 2);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}
