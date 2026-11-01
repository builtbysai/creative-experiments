// Paper is a burnable surface. It is a grid of cells (about 3 to 4 px each) with a small state machine per cell:
//
//   INTACT -> FLAME -> CHAR -> HOLE        (hot, energetic burns crumble away)
//                         \--> PATCH       (weak burns only blacken)
//   HOLE / PATCH -> MEND -> INTACT         (the page slowly knits itself back together)
//
// A flaming cell warms its eight neighbours. A neighbour ignites once it has soaked up enough heat, and carries
// on a little less energy than its parent, so every fire dies out by itself unless the dragon keeps feeding it.
// Dryness is a noise field: damp patches stall the front, so the burn boundary is ragged and islands survive.
//
// Drawing, bottom to top: soft scorch halo, the cell layer (flame front, glowing char, ash), crisp holes
// (marching squares into a Path2D per tile, with the desk showing through, an inner shadow and a charred rim),
// and light thrown on the page by the flames.

import { clamp, lerp, sstep, rr, fbm, noise2, rgbOf } from './util.js';

const INTACT = 0, FLAME = 1, CHAR = 2, HOLE = 3, MEND = 4, PATCH = 5;
const TILE = 12;                      // cells per tile side (for the hole paths)
const CS = 4;                         // coarse cells per scorch/light cell
const K_SPREAD = 6.5;                  // how quickly a flame warms its neighbours
const DECAY = 0.86;                  // energy kept at each hop
const E_MIN = 0.4;                    // below this a flame cannot light its neighbours

const fract = x => x - Math.floor(x);
const hashI = i => fract(Math.sin(i * 12.9898) * 43758.5453);

function glowSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,214,130,1)'); gr.addColorStop(0.3, 'rgba(255,150,50,0.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

export class Paper {
  constructor() {
    this.cols = 0; this.rows = 0; this.cs = 4; this.W = 0; this.H = 0;
    this.now = 0; this.enabled = true;
    this.glow = glowSprite();
    this.stats = { flame: 0, char: 0, holes: 0, newHoles: 0, ignitions: 0, heat: 0 };
    this.underCache = {};
  }

  // ---------------------------------------------------------------- allocation
  resize(W, H) {
    this.W = W; this.H = H;
    const cs = this.cs = clamp(Math.max(W, H) / 380, 2.8, 4.2);
    const cols = this.cols = Math.ceil(W / cs), rows = this.rows = Math.ceil(H / cs), n = cols * rows;
    this.st = new Uint8Array(n); this.kind = new Uint8Array(n);
    this.heat = new Float32Array(n); this.heatT = new Float32Array(n); this.en = new Float32Array(n);
    this.t = new Float32Array(n); this.dur = new Float32Array(n); this.c = new Float32Array(n); this.mendAt = new Float32Array(n);
    this.dry = new Float32Array(n);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * cs, y = j * cs;
      // fibre-scale noise on top of broad damp patches
      let d = 0.62 + 0.75 * fbm(x / 70, y / 70, 3, 3) + 0.25 * (noise2(x / 5, y / 5, 9) - 0.5);
      const damp = fbm(x / 190 + 40, y / 190, 7, 3);
      if (damp < 0.34) d *= 0.35 + 1.9 * damp;
      this.dry[j * cols + i] = clamp(d, 0.12, 1.5);
    }
    this.act = new Int32Array(n); this.actPos = new Int32Array(n).fill(-1); this.nAct = 0;
    // vertex jitter for ragged torn edges
    this.vj = new Float32Array((cols + 1) * (rows + 1));
    for (let i = 0; i < this.vj.length; i++) this.vj[i] = (hashI(i + 0.37) - 0.5) * 0.5;
    // tiles
    this.tcols = Math.ceil(cols / TILE); this.trows = Math.ceil(rows / TILE);
    this.tilePath = new Array(this.tcols * this.trows).fill(null);
    this.tileDirty = new Uint8Array(this.tcols * this.trows); this.dirtyList = [];
    // coarse maps
    this.cw = Math.ceil(cols / CS); this.ch = Math.ceil(rows / CS);
    this.scorch = new Float32Array(this.cw * this.ch); this.hot = new Float32Array(this.cw * this.ch); this.hotShown = new Float32Array(this.cw * this.ch);
    this.cellC = document.createElement('canvas'); this.cellC.width = cols * 2; this.cellC.height = rows * 2;
    this.cellCtx = this.cellC.getContext('2d'); this.cellImg = this.cellCtx.createImageData(cols * 2, rows * 2);
    this.cell32 = new Uint32Array(this.cellImg.data.buffer);
    this.holePath = null; this.holeCount = 0;
    this.stats.flame = this.stats.char = this.stats.holes = 0;
  }

  /** Put the page back as it was. */
  reset() { if (this.cols) this.resize(this.W, this.H); }
  get active() { return this.nAct > 0; }

  // ---------------------------------------------------------------- active list
  _add(i) { if (this.actPos[i] < 0) { this.actPos[i] = this.nAct; this.act[this.nAct++] = i; } }
  _remove(i) {
    const p = this.actPos[i]; if (p < 0) return;
    const last = this.act[--this.nAct]; this.act[p] = last; this.actPos[last] = p; this.actPos[i] = -1;
  }
  _dirty(i) {
    const cols = this.cols, ci = i % cols, cj = (i / cols) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const x = ci + di, y = cj + dj; if (x < 0 || y < 0 || x >= cols || y >= this.rows) continue;
      const tIdx = ((y / TILE) | 0) * this.tcols + ((x / TILE) | 0);
      if (!this.tileDirty[tIdx]) { this.tileDirty[tIdx] = 1; this.dirtyList.push(tIdx); }
    }
  }

  // ---------------------------------------------------------------- lighting fires
  cellAt(x, y) { const i = (x / this.cs) | 0, j = (y / this.cs) | 0; return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i; }

  /** Soak a cell in heat; ignite it when it has had enough. `e` is the energy the fire there will carry. */
  _heat(i, amount, e) {
    if (this.st[i] !== INTACT) return;
    const dt = this.now - this.heatT[i];
    if (dt > 0) this.heat[i] *= Math.exp(-dt * 0.7);
    this.heatT[i] = this.now;
    this.heat[i] += amount;
    if (e > this.en[i]) this.en[i] = e;
    if (this.heat[i] >= 1) this.ignite(i, this.en[i] || e);
  }

  ignite(i, e) {
    if (this.st[i] !== INTACT || !this.enabled) return;
    const d = this.dry[i];
    this.st[i] = FLAME; this.t[i] = 0; this.en[i] = e;
    this.dur[i] = (0.26 + 0.5 * clamp(d, 0.3, 1.3)) * (0.75 + 0.5 * Math.random());
    const ci = i % this.cols, cj = (i / this.cols) | 0;
    this.kind[i] = (e * (0.5 + 0.5 * d) + (fbm(ci * this.cs / 30, cj * this.cs / 30, 21, 3) - 0.5) * 1.0 + (Math.random() - 0.5) * 0.18 > 0.92) ? 1 : 0;
    this._add(i); this.stats.ignitions++;
  }

  /** The dragon's breath, a burning word, anything hot at a point. `power` is heat per second. */
  burnAt(x, y, dt, power = 26, energy = 1) {
    if (!this.enabled) return;
    const i = this.cellAt(x, y); if (i < 0) return;
    const cols = this.cols;
    this._heat(i, dt * power * this.dry[i], energy);
    for (const o of [-1, 1, -cols, cols]) { const k = i + o; if (k >= 0 && k < this.st.length) this._heat(k, dt * power * 0.3 * this.dry[k], energy * 0.9); }
  }

  /** Set light to a whole patch at once (a word catching fire). */
  igniteArea(x, y, r, energy = 0.8) {
    if (!this.enabled) return;
    const cs = this.cs, i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((y - r) / cs), j1 = Math.floor((y + r) / cs);
    for (let j = Math.max(0, j0); j <= Math.min(this.rows - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.cols - 1, i1); i++) {
      const dx = (i + 0.5) * cs - x, dy = (j + 0.5) * cs - y;
      if (dx * dx + dy * dy < r * r && Math.random() < 0.45) this._heat(j * this.cols + i, 1.2, energy);
    }
  }

  // ---------------------------------------------------------------- queries
  /** How much of the page at (x, y) has fallen away (0..1). */
  /** A random burnt-through spot between minD and maxD of (x, y), or null. */
  randomHole(x, y, minD, maxD) {
    for (let k = 0; k < 24 && this.nAct > 0; k++) {
      const i = this.act[(Math.random() * this.nAct) | 0];
      if (this.st[i] !== HOLE || !this.kind[i]) continue;
      const hx = (i % this.cols + 0.5) * this.cs, hy = (((i / this.cols) | 0) + 0.5) * this.cs, d = Math.hypot(hx - x, hy - y);
      if (d >= minD && d <= maxD) return { x: hx, y: hy };
    }
    return null;
  }
  holeAt(x, y) { const i = this.cellAt(x, y); if (i < 0) return 0; const s = this.st[i]; return (s === HOLE || s === MEND) && this.kind[i] ? this.c[i] : 0; }
  stateAt(x, y) { const i = this.cellAt(x, y); return i < 0 ? INTACT : this.st[i]; }
  flameAt(x, y) { return this.stateAt(x, y) === FLAME; }
  /** Local hotness 0..1 from flames in the surrounding coarse cell. */
  hotAt(x, y) { const i = Math.floor(x / (this.cs * CS)), j = Math.floor(y / (this.cs * CS)); return i < 0 || j < 0 || i >= this.cw || j >= this.ch ? 0 : this.hotShown[j * this.cw + i]; }

  // ---------------------------------------------------------------- simulation
  update(dt, emit) {
    if (!this.cols) return;
    this.now += dt;
    const { st, t, dur, en, c, kind, mendAt, dry, cols, rows } = this, cw = this.cw;
    this.hot.fill(0);
    let flame = 0, chr = 0, newHoles = 0;
    const act = this.act;
    // iterate over a snapshot of the count; cells added during the pass wait for the next frame
    for (let a = 0; a < this.nAct; a++) {
      const i = act[a], s = st[i];
      t[i] += dt;
      if (s === FLAME) {
        flame++;
        const u = t[i] / dur[i];
        // a flame burns brightest in the middle of its life
        const e = en[i] * (0.55 + 0.45 * Math.sin(clamp(u, 0, 1) * Math.PI));
        const ci = i % cols, cj = (i / cols) | 0;
        this.hot[((cj / CS) | 0) * cw + ((ci / CS) | 0)] += 1 - 0.6 * u;
        if (e > E_MIN && u < 0.9) {
          const rate = dt * K_SPREAD * e, ne = en[i] * DECAY;
          for (let dj = -1; dj <= 1; dj++) {
            const y = cj + dj; if (y < 0 || y >= rows) continue;
            for (let di = -1; di <= 1; di++) {
              if (!di && !dj) continue;
              const x = ci + di; if (x < 0 || x >= cols) continue;
              const k = y * cols + x;
              if (st[k] === INTACT) this._heat(k, rate * dry[k] * (di && dj ? 0.72 : 1), ne);
            }
          }
        }
        if (t[i] >= dur[i]) { st[i] = CHAR; t[i] = 0; dur[i] = 1.1 + 1.6 * Math.random(); }
      } else if (s === CHAR) {
        chr++;
        if (t[i] >= dur[i]) {
          if (kind[i]) { st[i] = HOLE; c[i] = 0; this.stats.newHoles++; newHoles++; this._dirty(i); }
          else { st[i] = PATCH; c[i] = 1; }
          t[i] = 0; mendAt[i] = 7 + 7 * noise2((i % cols) / 22, ((i / cols) | 0) / 22, 11) + 3 * Math.random();
        }
      } else if (s === HOLE) {
        if (c[i] < 1) { c[i] = Math.min(1, c[i] + dt / 0.55); this._dirty(i); }
        if (t[i] > mendAt[i] && this.mendEnabled !== false) { st[i] = MEND; t[i] = 0; }
      } else if (s === PATCH) {
        if (t[i] > mendAt[i] * 0.55 && this.mendEnabled !== false) { st[i] = MEND; t[i] = 0; }
      } else if (s === MEND) {
        c[i] -= dt / 1.3;
        if (kind[i]) this._dirty(i);
        if (c[i] <= 0) {
          st[i] = INTACT; c[i] = 0; this.heat[i] = 0; this.en[i] = 0; t[i] = 0;
          this._remove(i); a--;                         // swap-removed: revisit this slot
        }
      }
    }
    // scorch accumulates around fire and fades slowly once it's gone
    const sc = this.scorch, hot = this.hot, hs = this.hotShown;
    for (let k = 0; k < sc.length; k++) {
      const h = hot[k], target = clamp(h / 7, 0, 1);
      hs[k] += (target - hs[k]) * Math.min(1, dt * 8);
      if (h > 0) sc[k] = Math.min(1, sc[k] + dt * (0.35 + 0.1 * Math.min(h, 8)) * Math.min(1, h / 3));
      else if (sc[k] > 0) sc[k] = Math.max(0, sc[k] - dt * 0.03);
    }
    this.stats.flame = flame; this.stats.char = chr; this.stats.heat = flame;
    if (emit && flame + chr > 0) this.emitParticles(dt, emit);
    this.stats.newHoles = newHoles;
  }

  /** Flames, smoke, sparks and embers rise from the burning cells. */
  emitParticles(dt, p) {
    const { act, st, cols, cs } = this, u = 8;
    const rate = (kind, per) => { const x = per * dt; return Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0); };
    const pick = want => {                                  // a random active cell in the wanted state
      for (let tries = 0; tries < 10; tries++) { const i = act[(Math.random() * this.nAct) | 0]; if (st[i] === want) return i; }
      return -1;
    };
    const fl = this.stats.flame, ch = this.stats.char;
    for (let k = rate(0, clamp(fl * 0.3, 0, 42)); k > 0; k--) {
      const i = pick(FLAME); if (i < 0) break;
      const x = (i % cols + Math.random()) * cs, y = (((i / cols) | 0) + Math.random()) * cs;
      p.flame(x, y, rr(-6, 6), -rr(6, 16), rr(0.25, 0.55), rr(5, 10), 28, u);
    }
    for (let k = rate(1, clamp(fl * 0.03 + ch * 0.008, 0, 9)); k > 0; k--) {
      const i = pick(Math.random() < 0.6 ? FLAME : CHAR); if (i < 0) break;
      p.smoke((i % cols + Math.random()) * cs, (((i / cols) | 0) + Math.random()) * cs, rr(-6, 10), -rr(8, 20), rr(1.3, 2.4), rr(6, 11));
    }
    for (let k = rate(2, clamp(fl * 0.012, 0, 4)); k > 0; k--) {
      const i = pick(FLAME); if (i < 0) break;
      p.spark((i % cols + 0.5) * cs, (((i / cols) | 0) + 0.5) * cs, rr(-40, 40), -rr(20, 80), rr(0.4, 0.9), 28, u);
    }
    for (let k = rate(3, clamp(ch * 0.006, 0, 3)); k > 0; k--) {
      const i = pick(CHAR); if (i < 0) break;
      p.ember((i % cols + 0.5) * cs, (((i / cols) | 0) + 0.5) * cs, rr(-10, 10), -rr(6, 18), rr(1.2, 2.8), 28, u);
    }
    // ash flakes where a hole has just fallen through
    if (this.stats.newHoles) for (let k = Math.min(2, this.stats.newHoles); k > 0; k--) {
      const i = pick(HOLE); if (i < 0) break;
      p.ash((i % cols + 0.5) * cs, (((i / cols) | 0) + 0.5) * cs, u);
    }
  }

  // ---------------------------------------------------------------- drawing
  /** Pixel colour (ABGR, little-endian) of one cell for the cell layer. */
  _px(i, theme, frame) {
    const s = this.st[i], u = this.t[i], { ch, as, sc } = this._col;
    const pack = (r, g, b, a) => ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
    const fl = 0.7 + 0.3 * Math.sin(frame * 0.5 + i * 0.37) * Math.sin(frame * 0.31 + i * 0.11);
    if (s === FLAME) {
      const k = clamp(u / this.dur[i], 0, 1);
      if (k < 0.16) { const m = k / 0.16; return pack(lerp(255, 255, m), lerp(246, 170, m) * fl + 40 * (1 - fl), lerp(190, 40, m), 255); }
      if (k < 0.42) { const m = (k - 0.16) / 0.26; return pack(lerp(255, 170, m) * fl, lerp(150, 34, m) * fl, lerp(36, 10, m), 255); }
      const m = (k - 0.42) / 0.58;
      return pack(lerp(130, ch[0], m) * (0.7 + 0.3 * fl), lerp(28, ch[1], m), lerp(10, ch[2], m), 255);
    }
    if (s === CHAR) {
      // newly burnt paper is brown, then blackens; some cells smoulder with a red core that fades
      const k = clamp(u / this.dur[i], 0, 1), nz = 0.82 + 0.36 * hashI(i + 3.1);
      const brown = 1 - sstep(0, 0.32, k), glowy = hashI(i) > 0.55 ? Math.pow(1 - k, 2) * fl : 0, g = glowy * 0.9;
      const r = lerp(ch[0], sc[0] * 0.7, brown) * nz, gg = lerp(ch[1], sc[1] * 0.6, brown) * nz, b = lerp(ch[2], sc[2] * 0.5, brown) * nz;
      return pack(lerp(r, 255, g), lerp(gg, 90, g), lerp(b, 20, g), 255);
    }
    if (s === HOLE) { const a = 1 - this.c[i]; return a > 0.01 ? pack(lerp(as[0], ch[0], 0.55), lerp(as[1], ch[1], 0.55), lerp(as[2], ch[2], 0.55), 255 * a) : 0; }
    if (s === PATCH) {                          // a toasted brown scorch that slowly lightens, never a black slab
      const m = clamp(u / Math.max(1, this.mendAt[i]), 0, 1), nz = 0.96 + 0.08 * hashI(i + 7.7);
      return pack(lerp(ch[0], sc[0], 0.55 + 0.3 * m) * nz, lerp(ch[1], sc[1], 0.55 + 0.3 * m) * nz, lerp(ch[2], sc[2], 0.55 + 0.3 * m) * nz, 200 - 90 * m);
    }
    if (s === MEND) {
      const cc = clamp(this.c[i], 0, 1);
      if (this.kind[i]) {                       // knitting back: a sparkle runs through the seam
        const tw = Math.max(0, Math.sin(frame * 0.35 + i * 1.7)), a = 255 * Math.min(1, cc * 3) * tw * 0.7;
        return a > 6 ? pack(255, 220, 150, a) : 0;
      }
      return pack(ch[0], ch[1], ch[2], 238 * cc);
    }
    return 0;
  }

  drawBase(g, theme, frame) {
    if (!this.cols || (!this.nAct && !this.scorchAny())) return;
    const { W, H, cs } = this;
    g.save();
    g.imageSmoothingEnabled = true;
    // 1. scorch halo: overlapping soft brown sprites, so it has no visible grid
    const spr = this.scorchSprite(theme), sz = cs * CS * 1.2, cw = this.cw, sc = this.scorch;
    for (let j = 0; j < this.ch; j++) for (let i = 0; i < cw; i++) {
      const v = sc[j * cw + i]; if (v < 0.03) continue;
      g.globalAlpha = Math.min(1, v) * (theme.dark ? 0.36 : 0.32);
      g.drawImage(spr, (i + 0.5) * cs * CS - sz, (j + 0.5) * cs * CS - sz, sz * 2, sz * 2);
    }
    g.globalAlpha = 1;
    // 2. cell layer
    const buf = this.cell32, cols = this.cols, rows = this.rows, st = this.st, w2 = cols * 2;
    buf.fill(0);
    this._col = { ch: rgbOf(theme.char), as: rgbOf(theme.ash), sc: rgbOf(theme.scorch) };
    for (let a = 0; a < this.nAct; a++) {
      const i = this.act[a], px = this._px(i, theme, frame); if (!px) continue;
      const ci = i % cols, cj = (i / cols) | 0, A = px >>> 24, rgb = px & 0xffffff;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        // sub-pixel coverage from this cell and the three neighbours on that side: ragged, fibrous edges
        const nx = ci + (sx ? 1 : -1), ny = cj + (sy ? 1 : -1);
        const cx = nx >= 0 && nx < cols ? (st[cj * cols + nx] ? 1 : 0) : 1, cy = ny >= 0 && ny < rows ? (st[ny * cols + ci] ? 1 : 0) : 1;
        const cd = nx >= 0 && nx < cols && ny >= 0 && ny < rows ? (st[ny * cols + nx] ? 1 : 0) : 1;
        const cov = 0.4 + 0.2 * cx + 0.2 * cy + 0.2 * cd;
        let al = cov >= 1 ? 1 : clamp((cov - 0.42 + (hashI(i * 4 + sy * 2 + sx) - 0.5) * 0.5) / 0.3, 0, 1);
        const a2 = (A * al) | 0; if (a2 < 3) continue;
        buf[(cj * 2 + sy) * w2 + ci * 2 + sx] = (a2 << 24) | rgb;
      }
    }
    this.cellCtx.putImageData(this.cellImg, 0, 0);
    g.drawImage(this.cellC, 0, 0, this.cols * cs, this.rows * cs);
    // 3. holes
    this.drawHoles(g, theme);
    g.restore();
  }

  scorchSprite(theme) {
    this._sp = this._sp || {};
    let c = this._sp[theme.name];
    if (!c) {
      c = this._sp[theme.name] = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), col = rgbOf(theme.scorch), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},1)`); gr.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},0.45)`); gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    }
    return c;
  }

  scorchAny() { for (let k = 0; k < this.scorch.length; k++) if (this.scorch[k] > 0.01) return true; return false; }

  drawHoles(g, theme) {
    if (this.dirtyList.length) { for (const tIdx of this.dirtyList) { this.tilePath[tIdx] = this.buildTile(tIdx); this.tileDirty[tIdx] = 0; } this.dirtyList.length = 0; this.holePath = null; }
    if (!this.holePath) {
      const all = new Path2D(), lines = new Path2D(); let n = 0;
      for (const p of this.tilePath) if (p) { all.addPath(p.fill); lines.addPath(p.line); n++; }
      this.holePath = n ? { fill: all, line: lines } : false;
    }
    if (!this.holePath) return;
    const hp = this.holePath.fill, lp = this.holePath.line;
    g.fillStyle = this.underPattern(g, theme);
    g.fill(hp);
    g.save(); g.clip(hp);
    // depth: the paper has thickness, so the top-left lip shadows the desk beneath it
    g.translate(2.4, 3.4); g.lineWidth = 8; g.lineJoin = 'round';
    g.strokeStyle = theme.dark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.6)'; g.stroke(lp);
    g.translate(2.4, 3.4); g.lineWidth = 16; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke(lp);
    g.restore();
    // charred rim with a crumbly pale edge
    g.lineJoin = 'round';
    g.strokeStyle = theme.char; g.lineWidth = 3.2; g.stroke(lp);
    g.strokeStyle = theme.dark ? 'rgba(160,150,140,0.28)' : 'rgba(150,140,130,0.4)'; g.lineWidth = 1; g.stroke(lp);
  }

  underPattern(g, theme) {
    let p = this.underCache[theme.name];
    if (!p) {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      const x = c.getContext('2d'), img = x.createImageData(96, 96), u = rgbOf(theme.under), ul = rgbOf(theme.underLight);
      for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
        const n = fbm(i / 9, j / 9, 31, 3) * 0.7 + noise2(i * 1.3, j * 1.3, 5) * 0.3, k = (j * 96 + i) * 4;
        img.data[k] = lerp(u[0], ul[0], n); img.data[k + 1] = lerp(u[1], ul[1], n); img.data[k + 2] = lerp(u[2], ul[2], n); img.data[k + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      p = this.underCache[theme.name] = g.createPattern(c, 'repeat');
    }
    return p;
  }

  /** Marching squares over one tile of the hole field. Inside cells are merged into runs. */
  buildTile(tIdx) {
    const { cols, rows, cs, st, kind, c, vj } = this, tc = this.tcols;
    const tx = tIdx % tc, ty = (tIdx / tc) | 0, x0 = tx * TILE, y0 = ty * TILE, x1 = Math.min(cols, x0 + TILE), y1 = Math.min(rows, y0 + TILE);
    const hv = (i, j) => { if (i < 0 || j < 0 || i >= cols || j >= rows) return 0; const k = j * cols + i, s = st[k]; return (s === HOLE || s === MEND) && kind[k] ? c[k] : 0; };
    const w = x1 - x0 + 1, h = y1 - y0 + 1, f = new Float32Array(w * h);
    let nz = false;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const vx = x0 + i, vy = y0 + j;
      const v = (hv(vx - 1, vy - 1) + hv(vx, vy - 1) + hv(vx - 1, vy) + hv(vx, vy)) * 0.25;
      f[j * w + i] = v > 0 ? v + vj[vy * (cols + 1) + vx] * Math.min(1, v * 3) : 0;
      if (v > 0) nz = true;
    }
    if (!nz) return null;
    const p = new Path2D(), ln = new Path2D(), T = 0.5, R = v => Math.round(v * cs);
    const cross = (a, b) => { const t = (T - a) / (b - a || 1e-6); return clamp(t, 0, 1); };
    for (let j = 0; j < h - 1; j++) {
      let run = -1;
      for (let i = 0; i < w - 1; i++) {
        const a = f[j * w + i], b = f[j * w + i + 1], cc = f[(j + 1) * w + i + 1], d = f[(j + 1) * w + i];
        const ia = a >= T, ib = b >= T, ic = cc >= T, id = d >= T, cnt = ia + ib + ic + id;
        if (cnt === 4) { if (run < 0) run = i; continue; }
        if (run >= 0) { p.rect(R(x0 + run), R(y0 + j), R(x0 + i) - R(x0 + run), R(y0 + j + 1) - R(y0 + j)); run = -1; }
        if (!cnt) continue;
        const X = R(x0 + i), Y = R(y0 + j), X1 = R(x0 + i + 1), Y1 = R(y0 + j + 1), cwid = X1 - X, chei = Y1 - Y, pts = [], cr = [];
        // walk the square clockwise: corner, crossing, corner, crossing, ...
        if (ia) pts.push(X, Y);
        if (ia !== ib) { const q = X + cross(a, b) * cwid; pts.push(q, Y); cr.push(q, Y); }
        if (ib) pts.push(X1, Y);
        if (ib !== ic) { const q = Y + cross(b, cc) * chei; pts.push(X1, q); cr.push(X1, q); }
        if (ic) pts.push(X1, Y1);
        if (ic !== id) { const q = X + cross(d, cc) * cwid; pts.push(q, Y1); cr.push(q, Y1); }
        if (id) pts.push(X, Y1);
        if (id !== ia) { const q = Y + cross(a, d) * chei; pts.push(X, q); cr.push(X, q); }
        for (let k = 0; k + 3 < cr.length; k += 4) { ln.moveTo(cr[k], cr[k + 1]); ln.lineTo(cr[k + 2], cr[k + 3]); }
        p.moveTo(pts[0], pts[1]);
        for (let k = 2; k < pts.length; k += 2) p.lineTo(pts[k], pts[k + 1]);
        p.closePath();
      }
      if (run >= 0) p.rect(R(x0 + run), R(y0 + j), R(x1) - R(x0 + run), R(y0 + j + 1) - R(y0 + j));
    }
    return { fill: p, line: ln };
  }

  /** Light the flames throw on the page: a warm bloom per busy tile. */
  drawGlow(g, theme, frame) {
    if (!this.cols || this.stats.flame < 1) return;
    const hs = this.hotShown, cw = this.cw, size = this.cs * CS * 3.2;
    g.save();
    g.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
    const flick = 0.85 + 0.15 * Math.sin(frame * 0.9) * Math.sin(frame * 0.57);
    for (let j = 0; j < this.ch; j++) for (let i = 0; i < cw; i++) {
      const v = hs[j * cw + i]; if (v < 0.04) continue;
      const x = (i + 0.5) * this.cs * CS, y = (j + 0.5) * this.cs * CS;
      g.globalAlpha = Math.min(1, v) * (theme.dark ? 0.55 : 0.32) * flick;
      g.drawImage(this.glow, x - size, y - size, size * 2, size * 2);
    }
    g.restore();
  }
}
