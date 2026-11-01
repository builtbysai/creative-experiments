// The World owns everything that exists at once: the canvas, the page and the paper under it, the dragons, the
// particles, the pointer and the sound. Dragons are added and removed freely; each one has its own genome, rig,
// brain and renderer. The World keeps them out of each other's way (via their Brains) and draws the scene.

import { TAU, clamp, Rng, rgba } from './util.js';
import { THEMES } from './themes.js';
import { Genome } from './genome.js';
import { Dragon } from './dragon.js';
import { DragonRenderer } from './dragon-render.js';
import { Particles, flameSprites } from './particles.js';
import { Page } from './page.js';
import { Paper } from './paper.js';
import { Sound } from './audio.js';

export const MAX_DRAGONS = 6;

export class World {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.dpr = 1; this.baseL = 400; this.countScale = 1; this.unit = 13;
    this.time = 0; this.frame = 0; this.running = true; this.last = 0;
    this.dragons = []; this.renderers = new Map(); this.leaderId = null; this.selectedId = null;
    this.flocking = true;
    this.particles = new Particles(); this.page = new Page(); this.paper = new Paper(); this.sound = new Sound();
    this.paperOn = true;
    this.listeners = new Set();
    this.events = { wordBurn: w => {} };
    this.pointer = { x: 0, y: 0, down: false, mouseDown: false, key: false, seen: false, inside: false, type: 'mouse', lastMove: -99, idleFor: 99, moveSince: 0 };
    this.shake = 0; this.pops = 0;

    // theme: system preference unless forced by ?theme= or the panel
    const q = new URLSearchParams(location.search).get('theme');
    let saved = null; try { saved = localStorage.getItem('draco.theme'); } catch (_) {}
    this.mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.themeMode = q === 'dark' || q === 'light' ? q : (saved === 'dark' || saved === 'light' ? saved : 'auto');
    this.themeForced = q === 'dark' || q === 'light';
    this.mq.addEventListener && this.mq.addEventListener('change', () => { if (this.themeMode === 'auto') this.applyTheme(); });
    this.applyTheme();
    this.bindInput();
  }

  // ---------------------------------------------------------------- theme
  applyTheme() {
    const name = this.themeMode === 'auto' ? (this.mq.matches ? 'dark' : 'light') : this.themeMode;
    this.theme = THEMES[name];
    document.documentElement.dataset.theme = name;
    document.documentElement.style.setProperty('color-scheme', name);
    if (this.W) this.buildPaperBitmap();
    this.emit('theme');
  }
  setThemeMode(m) {
    this.themeMode = m;
    if (!this.themeForced) try { localStorage.setItem('draco.theme', m); } catch (_) {}
    this.applyTheme();
  }

  // ---------------------------------------------------------------- events (for the panel)
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, payload) { for (const fn of this.listeners) fn(type, payload); }

  // ---------------------------------------------------------------- dragons
  get leader() { return this.dragons.find(d => d.id === this.leaderId) || this.dragons[0]; }
  get selected() { return this.dragons.find(d => d.id === this.selectedId) || this.dragons[0]; }
  select(d) { this.selectedId = d.id; this.emit('select', d); }
  setLeader(d) { this.leaderId = d.id; this.emit('leader', d); }

  rescale() {
    const n = Math.max(1, this.dragons.length);
    this.countScale = clamp(1 / Math.pow(n, 0.42), 0.46, 1);
    this.unit = this.baseL * this.countScale / 30;
  }

  addDragon(genome, opts = {}) {
    if (this.dragons.length >= MAX_DRAGONS) return null;
    const d = new Dragon(this, genome, opts);
    this.dragons.push(d); this.renderers.set(d.id, new DragonRenderer(d));
    if (this.leaderId == null) this.leaderId = d.id;
    this.selectedId = d.id;
    this.rescale();
    for (const o of this.dragons) o.sync();
    const i = this.dragons.length - 1, L = d.L;
    if (opts.enter !== false && this.W) {
      const y = this.H * (0.5 + 0.13 * ((i % 3) - 1));
      d.place(-L * 0.5 - i * L * 0.9, y, 0, 0.3);
      d.brain.enter({ x: this.W * (0.3 + 0.12 * i), y });
    } else if (this.W) d.place(opts.x ?? this.W * 0.5, opts.y ?? this.H * 0.55, opts.h ?? 0);
    this.emit('dragons');
    return d;
  }

  removeDragon(d) {
    if (this.dragons.length <= 1) return;
    this.dragons.splice(this.dragons.indexOf(d), 1); this.renderers.delete(d.id);
    if (this.leaderId === d.id) this.leaderId = this.dragons[0].id;
    if (this.selectedId === d.id) this.selectedId = this.dragons[0].id;
    this.rescale(); for (const o of this.dragons) o.sync();
    this.emit('dragons');
  }

  // ---------------------------------------------------------------- layout
  resize() {
    const dpr = this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = this.W = window.innerWidth, H = this.H = window.innerHeight;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.baseL = clamp(Math.min(W, H * 1.15) * 0.82, 250, 640);
    this.rescale();
    this.page.fit(W, H, this.g);
    this.paper.resize(W, H);
    this.buildPaperBitmap();
    for (const d of this.dragons) { d.sync(true); if (!d.x && !d.y) d.place(W * 0.5, H * 0.55, 0); else { d.x = clamp(d.x, 0, W); d.y = clamp(d.y, 0, H); } }
  }

  buildPaperBitmap() {
    const { W, H, dpr, theme: T } = this;
    const c = this.paperC = document.createElement('canvas'); c.width = this.cv.width; c.height = this.cv.height;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = T.paper; g.fillRect(0, 0, W, H);
    const r = new Rng(5);
    for (let i = 0; i < 16; i++) {
      const x = r.next() * W, y = r.next() * H, rad = (0.08 + r.next() * 0.22) * Math.max(W, H);
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, rgba(T.stain, 0.07)); rg.addColorStop(1, rgba(T.stain, 0));
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const n = Math.min(9000, (W * H) / 600) | 0;
    for (let i = 0; i < n; i++) {
      g.fillStyle = r.next() < 0.5 ? T.speckA : T.speckB;
      const x = r.next() * W, y = r.next() * H, len = 1 + r.next() * 4;
      g.save(); g.translate(x, y); g.rotate(r.next() * TAU); g.fillRect(0, 0, len, 0.8); g.restore();
    }
    const vg = g.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, T.vignette);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.strokeStyle = T.rule; g.lineWidth = 1; g.beginPath();
    const { colX0, colX1, fs, topY } = this.page;
    const rx0 = colX0 - fs * 0.9, rx1 = colX1 + fs * 0.9, ry0 = topY - fs * 0.8, ry1 = H - topY * 0.5;
    g.moveTo(rx0, ry0); g.lineTo(rx0, ry1); g.moveTo(rx1, ry0); g.lineTo(rx1, ry1);
    g.moveTo(rx0 - fs * 0.35, ry0); g.lineTo(rx0 - fs * 0.35, ry1); g.moveTo(rx1 + fs * 0.35, ry0); g.lineTo(rx1 + fs * 0.35, ry1);
    g.stroke();
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const cv = this.cv, p = this.pointer;
    const set = e => { const dx = e.clientX - p.x, dy = e.clientY - p.y; if (p.seen) p.moveSince += Math.hypot(dx, dy); p.x = e.clientX; p.y = e.clientY; p.inside = true; p.seen = true; p.lastMove = this.time; p.type = e.pointerType || 'mouse'; };
    cv.addEventListener('pointermove', set);
    cv.addEventListener('pointerdown', e => { set(e); p.mouseDown = true; p.moveSince += 200; this.sound.unlock(); try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
    const up = () => { p.mouseDown = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') p.inside = false; p.mouseDown = false; });
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || '')) { p.key = true; p.seen = true; p.lastMove = this.time; this.sound.unlock(); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { if (e.code === 'Space') p.key = false; });
    window.addEventListener('resize', () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.resize(), 120); });
  }

  // ---------------------------------------------------------------- simulation
  update(dt) {
    this.time += dt; this.frame++;
    const p = this.pointer;
    p.down = p.mouseDown || p.key;
    p.idleFor = p.down ? 0 : (p.inside || p.type === 'touch' ? this.time - p.lastMove : 99);
    if (p.down) p.lastMove = this.time;

    this.separate();
    for (const d of this.dragons) d.update(dt);

    const circs = [];
    for (const d of this.dragons) d.collectObstacles(circs);
    this.page.update(dt, circs, this);

    const pg = this.page, pp = this.paperOn ? this.paper : null;
    this.particles.update(dt, this.time, (q, ddt) => { pg.hit(q, this); if (pp) pp.burnAt(q.x, q.y, ddt, 10, 0.8 + 0.1 * Math.random()); });
    this.paper.enabled = this.paperOn;
    this.paper.update(dt, this.paperOn ? this.particles : null);

    let breath = 0, bx = 0; for (const d of this.dragons) if (d.breath > breath) { breath = d.breath; bx = d.headPos.x; }
    const pops = this.paper.stats.newHoles + this.paper.stats.ignitions * 0.0;
    this.sound.update(dt, { breath, flame: this.paper.stats.flame, pops: this.paper.stats.newHoles, x: this.W ? clamp(bx / this.W * 2 - 1, -1, 1) : 0 });
    this.shake = Math.max(this.shake * Math.exp(-dt * 6), breath * 0.9 + Math.min(2, pops * 0.35));
    this.paper.stats.ignitions = 0;
    this.emit('frame');
  }

  /** Safety net under the Brains' avoidance: a head that has got inside another dragon's body is eased out of it. */
  separate() {
    for (const d of this.dragons) {
      let nx = 0, ny = 0; const r0 = d.L * 0.055;
      for (const o of this.dragons) {
        if (o === d) continue;
        for (let j = 0; j < o.S.length; j += 3) {
          const s = o.S[j], dx = d.x - s.x, dy = d.y - s.y, dist = Math.hypot(dx, dy), min = s.hw + r0 + d.L * 0.03;
          if (dist < min) { const f = (min - dist) / min; nx += dx / (dist || 1) * f; ny += dy / (dist || 1) * f; }
        }
      }
      d.nudgeX = nx * d.L * 0.9; d.nudgeY = ny * d.L * 0.9;
    }
  }

  // ---------------------------------------------------------------- drawing
  draw() {
    const { g, theme: T, dpr } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.drawImage(this.paperC, 0, 0);
    const sx = this.shake > 0.05 ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake > 0.05 ? (Math.random() - 0.5) * this.shake : 0;
    g.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    if (this.paperOn || this.paper.active) this.paper.drawBase(g, T, this.frame);
    this.page.draw(g, T, this.time, this.paper);
    this.paper.drawGlow(g, T, this.frame);
    const env = { dpr, particles: this.particles, clock: this.time };
    const order = this.dragons.slice().sort((a, b) => a.id - b.id);
    for (const d of order) this.renderers.get(d.id).shadow(g, T, env);
    for (const d of order) this.renderers.get(d.id).draw(g, T, env);
    if (this.showSelection) this.drawSelection(g, T);
    this.particles.draw(g, T, this.time);
    this.drawBloom(g, T);
    this.drawCursor(g, T);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawBloom(g, T) {
    let hue = 28, top = 0;
    for (const d of this.dragons) {
      if (d.breath < 0.05) continue;
      const sp = flameSprites(d.genome.v.fireHue), s = d.L * 0.26 * d.breath;
      g.globalCompositeOperation = T.dark ? 'lighter' : 'source-over'; g.globalAlpha = (T.dark ? 0.3 : 0.24) * d.breath;
      g.drawImage(sp.glow, d.mouth.x - s, d.mouth.y - s, s * 2, s * 2);
      if (d.breath > top) { top = d.breath; hue = d.genome.v.fireHue; }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    this.particles.drawBloom(g, T, this.baseL * this.countScale, hue);
  }

  drawSelection(g, T) {
    const d = this.selected; if (!d) return;
    const p = d.S[0], r = d.L * 0.095;
    g.save(); g.strokeStyle = T.uiAccent; g.globalAlpha = 0.7 + 0.2 * Math.sin(this.time * 3); g.lineWidth = 1.4; g.setLineDash([4, 5]);
    g.lineDashOffset = -this.time * 10;
    g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke(); g.restore();
  }

  drawCursor(g, T) {
    const p = this.pointer;
    if (!p.inside || (this.time - p.lastMove > 10 && !p.down)) return;
    if (p.type === 'touch' && !p.down && this.time - p.lastMove > 1.2) return;
    const r = p.down ? 9 : 12 + 1.8 * Math.sin(this.time * 4);
    g.save();
    if (p.down) {
      const sp = flameSprites(this.leader.genome.v.fireHue);
      g.globalCompositeOperation = T.dark ? 'lighter' : 'source-over';
      g.globalAlpha = 0.55; g.drawImage(sp.glow, p.x - 30, p.y - 30, 60, 60); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.lineWidth = 1.5; g.strokeStyle = p.down ? 'rgba(255,150,50,0.95)' : T.cursor;
    g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke();
    g.fillStyle = p.down ? 'rgba(255,200,110,1)' : T.cursor;
    g.beginPath(); g.arc(p.x, p.y, 2.2, 0, TAU); g.fill();
    g.restore();
  }

  // ---------------------------------------------------------------- loop
  start() {
    const frame = t => {
      if (!this.running) return;
      const dt = Math.min(0.033, this.last ? (t - this.last) / 1000 : 0.016);
      this.last = t;
      this.update(dt); this.draw();
      requestAnimationFrame(frame);
    };
    this._frame = frame;
    requestAnimationFrame(frame);
  }
  pause() { this.running = false; }
  resume() { if (!this.running) { this.running = true; this.last = 0; requestAnimationFrame(this._frame); } }

  /** Wipe the burn: page, paper, particles. */
  restorePage() { this.paper.reset(); this.page.restore(); this.particles.clear(); this.emit('restore'); }
}
