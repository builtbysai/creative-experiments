// The Page is the text on the paper. It is re-typeset every frame: each line is cut into free runs around the
// circles the dragons occupy, and words ease sideways into place. Words also burn: they catch from the breath,
// from the paper under them, and they vanish where the paper itself has fallen away.

import { clamp, sstep, mix, rr } from './util.js';

const HEADING = 'Dragon';
const TEXT = [
  'It walks the way a lizard does: four feet set down in turn, the long spine rippling behind. It is calm, curious, and in no hurry.',
  'Move and it follows, stopping a little short to look at you. Leave it alone and it wanders, stretches, reads a word, and sometimes falls asleep.',
  'Hold to breathe fire. It burns the words and scorches the page, and the page slowly mends.'
];
const CLOSING = 'Add more dragons from the editor and they will flock.';

const F_BODY = "Fraunces, Georgia, 'Times New Roman', serif";
const STY = {
  title: { font: s => `600 ${s * 2.2}px ${F_BODY}`, size: 2.2, lh: s => s * 2.2 * 1.15 },
  body: { font: s => `400 ${s}px ${F_BODY}`, size: 1, lh: s => s * 1.56 },
  closing: { font: s => `400 ${s * 0.95}px ${F_BODY}`, size: 0.95, lh: s => s * 1.56 }
};

export const T_FLAME = 0.6, T_CHAR = 0.5, T_ASH = 0.7, MEND = 8, MENDT = 3;

export class Page {
  constructor() {
    this.blocks = []; this.words = [];
    this.fs = 18; this.colX0 = 0; this.colX1 = 0; this.topY = 40;
    this.hash = new Map();
    this.build();
  }

  build() {
    this.blocks = []; this.words = [];
    const add = (style, text, gap) => {
      const b = { style, gap, words: [], space: 0 };
      const toks = text.split(' ');
      for (const t of toks) {
        const w = { text: t, w: 0, x: 0, y: 0, tx: 0, ty: 0, placed: false, size: 16, burn: -1, ashed: false, fx: 0, a: 1, gen: 0, b };
        b.words.push(w); this.words.push(w);
      }
      this.blocks.push(b);
    };
    add('title', HEADING, 0.4);
    TEXT.forEach((t, i) => add('body', t, i ? 0.6 : 0.8));
    add('closing', CLOSING, 1.0);
  }

  measure(g) {
    const { fs } = this;
    for (const b of this.blocks) {
      g.font = STY[b.style].font(fs);
      b.space = g.measureText(' ').width;
      for (const w of b.words) w.w = Math.min(g.measureText(w.text).width, this.colX1 - this.colX0);
    }
  }

  /** Lay the words out in lines, flowing around `circs` (optional). Returns the bottom of the text. */
  layout(circs) {
    const { fs } = this, minRun = fs * 2.2, clear = fs * 0.55;
    let y = this.topY, first = true;
    for (const b of this.blocks) {
      const st = STY[b.style], size = fs * st.size, lh = st.lh(fs);
      if (!first) y += b.gap * fs * 1.56;
      first = false;
      let wi = 0, guard = 0;
      while (wi < b.words.length) {
        const ymid = y + lh / 2, iv = [];
        if (circs) {
          for (let k = 0; k < circs.length; k++) {
            const c = circs[k], R = c.r + clear + lh * 0.3, dy = Math.abs(c.y - ymid);
            if (dy < R) { const hx = Math.sqrt(R * R - dy * dy); iv.push([c.x - hx, c.x + hx]); }
          }
        }
        iv.sort((a, c) => a[0] - c[0]);
        const runs = []; let cur = this.colX0;
        for (const [a, c] of iv) {
          if (a > cur) runs.push([cur, Math.min(a, this.colX1)]);
          if (c > cur) cur = c;
          if (cur >= this.colX1) break;
        }
        if (cur < this.colX1) runs.push([cur, this.colX1]);
        let placed = 0;
        for (const r of runs) {
          if (r[1] - r[0] < minRun && !(guard > 40)) continue;
          let x = r[0];
          while (wi < b.words.length) {
            const w = b.words[wi];
            if (x + w.w > r[1] + 0.5 && !(guard > 60)) break;
            w.tx = x; w.ty = y + lh * 0.5 + size * 0.33; w.size = size; w.sty = st;
            x += w.w + b.space; wi++; placed++;
            if (guard > 60) break;
          }
          if (wi >= b.words.length) break;
        }
        guard = placed ? 0 : guard + 1;
        y += lh;
      }
    }
    return y;
  }

  /** Find the biggest font that fits the viewport, then settle every word in place. */
  fit(W, H, g) {
    const pad = Math.max(18, W * 0.055);
    let size = 25;
    for (;;) {
      this.fs = size;
      const colW = Math.min(W - pad * 2, size * 32);
      this.colX0 = (W - colW) / 2; this.colX1 = this.colX0 + colW;
      this.topY = clamp(H * 0.07, 16, 72);
      this.measure(g);
      const bottom = this.layout(null);
      if (bottom <= H - Math.max(14, H * 0.045) || size <= 11.5) break;
      size -= 0.5;
    }
    // sit the block a little above the middle of the page
    const h = this.layout(null) - this.topY;
    this.topY = Math.max(this.topY, (H - h) * 0.32);
    for (const w of this.words) w.placed = false;
    this.layout(null);
    for (const w of this.words) { w.x = w.tx; w.y = w.ty; w.placed = true; }
    this.W = W; this.H = H; this.sig = null;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, circs, world) {
    // quantise the obstacles so the text only re-flows when the dragon has really moved, not on every pixel
    const q = this.fs * 0.3, qc = circs.map(c => ({ x: Math.round(c.x / q) * q, y: Math.round(c.y / q) * q, r: Math.ceil(c.r / q) * q }));
    const sig = qc.map(c => c.x + ',' + c.y + ',' + c.r).join(';');
    if (sig !== this.sig) { this.sig = sig; this.layout(qc); }
    const kx = 1 - Math.exp(-dt * 44), words = this.words;
    for (const w of words) {
      if (!w.placed) { w.x = w.tx; w.y = w.ty; w.placed = true; w.a = 1; }
      else if (Math.abs(w.ty - w.y) > 0.8) { w.x = w.tx; w.y = w.ty; w.a = 0.0; }     // changed line: no sliding through other lines
      else w.x += (w.tx - w.x) * kx;
      if (w.a < 1) w.a = Math.min(1, w.a + dt * 7);
    }
    // spatial hash for breath hits
    const CELL = 48, hash = this.hash; hash.clear();
    for (const w of words) {
      const x0 = (w.x / CELL) | 0, x1 = ((w.x + w.w) / CELL) | 0, y0 = ((w.y - w.size) / CELL) | 0, y1 = ((w.y + w.size * 0.3) / CELL) | 0;
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const key = cx * 4096 + cy; let a = hash.get(key); if (!a) hash.set(key, a = []); a.push(w);
      }
    }
    // the paper under a word can set it alight; a hole in the paper takes the word with it
    const paper = world.paper, u = world.unit;
    for (let i = 0; i < words.length; i++) {
      const w = words[i], cx = w.x + w.w / 2, cy = w.y - w.size * 0.3;
      if (w.burn < 0 && paper.enabled && paper.cols && paper.flameAt(cx, cy)) this.ignite(w, 2, world, true);
      if (paper.cols) {
        const h = (paper.holeAt(w.x + 1, cy) + paper.holeAt(cx, cy) + paper.holeAt(w.x + w.w - 1, cy)) / 3;
        w.hole = h;
      } else w.hole = 0;
    }
    // burning words: flames, creep along the line, char, ash
    const P = world.particles;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.burn < 0) continue;
      w.burn += dt;
      const t = w.burn;
      if (t < T_FLAME) {
        w.fx += dt * 34;
        while (w.fx >= 1) {
          w.fx -= 1;
          P.flame(w.x + Math.random() * w.w, w.y - w.size * 0.25, rr(-8, 8), -rr(3, 7) * u, rr(0.28, 0.5), rr(0.3, 0.6) * u, 28, u);
        }
        if (t > 0.18 && w.gen < 2 && Math.random() < dt * 2.2) {
          const nb = words[i + (Math.random() < 0.5 ? -1 : 1)];
          if (nb && nb.burn < 0 && Math.abs(nb.y - w.y) < w.size * 0.5) this.ignite(nb, w.gen + 1, world);
        }
      } else if (t >= T_FLAME + T_CHAR && !w.ashed) {
        w.ashed = true;
        const n = Math.ceil(w.w / 7);
        for (let k = 0; k < n; k++) P.ash(w.x + Math.random() * w.w, w.y - w.size * rr(0.1, 0.6), u);
        for (let k = 0; k < 3; k++) P.ember(w.x + Math.random() * w.w, w.y - w.size * 0.3, rr(-12, 12), -rr(2, 5) * u, rr(1.2, 2.6), 28, u);
        for (let k = 0; k < 2; k++) P.smoke(w.x + Math.random() * w.w, w.y - w.size * 0.4, rr(-6, 6), -rr(2, 4) * u, rr(1.2, 2), rr(0.9, 1.6) * u);
      }
    }
  }

  ignite(w, gen, world, fromPaper = false) {
    if (w.burn >= 0) return;
    w.burn = 0; w.ashed = false; w.fx = 0; w.gen = gen || 0;
    if (!fromPaper && world.paper) world.paper.igniteArea(w.x + w.w / 2, w.y - w.size * 0.3, w.w * 0.5 + w.size * 0.5, 0.78);
    
  }

  /** Breath particle q: does it touch a word? */
  hit(q, world) {
    const arr = this.hash.get(((q.x / 48) | 0) * 4096 + ((q.y / 48) | 0));
    if (arr) for (const w of arr) {
      if (w.burn < 0 && q.x > w.x - 2 && q.x < w.x + w.w + 2 && q.y > w.y - w.size * 0.95 && q.y < w.y + w.size * 0.3) this.ignite(w, 0, world);
    }
  }

  /** A word near (x, y) between distances `a` and `b` for a dragon to read or burn. */
  randomWord(x, y, a, b, unburnt) {
    const ws = this.words;
    for (let i = 0; i < 50; i++) {
      const w = ws[(Math.random() * ws.length) | 0];
      if (w.b.style !== 'body' || (unburnt && w.burn >= 0) || (w.hole || 0) > 0.2) continue;
      const cx = w.x + w.w / 2, d = Math.hypot(cx - x, w.y - y);
      if (d >= a && d <= b) return { x: cx, y: w.y - w.size * 0.3, w: w };
    }
    return null;
  }

  // ---------------------------------------------------------------- drawing
  draw(g, theme, clock, paper) {
    const { fs, blocks, words } = this;
    g.textBaseline = 'alphabetic';
    g.globalAlpha = 1;
    let curFont = '';
    for (const w of words) {
      const f = w.sty.font(fs);
      if (f !== curFont) { g.font = f; curFont = f; }
      const ink = w.b.style === 'closing' ? theme.label : theme.ink;
      let col = ink, a = 1, dx = 0, dy = 0;
      if (w.burn >= 0) {
        const t = w.burn;
        if (t < T_FLAME) { const k = t / T_FLAME; col = mix(ink, theme.burnt, k); dx = (Math.random() - 0.5) * 1.1; dy = (Math.random() - 0.5) * 0.8; }
        else if (t < T_FLAME + T_CHAR) col = theme.burnt;
        else if (t < T_FLAME + T_CHAR + T_ASH) { const k = (t - T_FLAME - T_CHAR) / T_ASH; col = mix(theme.burnt, theme.ash, k); a = 1 - k * 0.78; }
        else if (t < MEND) { col = theme.ash; a = 0.22 * (1 - sstep(MEND - 1.5, MEND, t)); }
        else { const k = (t - MEND) / MENDT; col = mix(theme.burnt, ink, k); a = k; if (k >= 1) w.burn = -1; }
      }
      // heat haze: words near flames shimmer
      if (paper && paper.cols) {
        const hot = paper.hotAt(w.x + w.w / 2, w.y);
        if (hot > 0.05) { dy += Math.sin(clock * 17 + w.x * 0.21) * hot * 1.4; dx += Math.sin(clock * 13 + w.y * 0.3) * hot * 0.7; }
      }
      a *= w.a * (1 - (w.hole || 0));
      if (a <= 0.01) continue;
      g.globalAlpha = a; g.fillStyle = col;
      g.fillText(w.text, w.x + dx, w.y + dy);
    }
    g.globalAlpha = 1;
  }

  /** Words currently alight. */
  get burning() { let n = 0; for (const w of this.words) if (w.burn >= 0 && w.burn < T_FLAME + T_CHAR) n++; return n; }
  /** Put every word back. */
  restore() { for (const w of this.words) { w.burn = -1; w.ashed = false; } }
}
