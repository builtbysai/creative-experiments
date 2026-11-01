// DragonRenderer draws one Dragon. It reads the dragon's rig (spine, legs, wings, head, pose) and its genome's
// palette, and owns nothing but cached paths. Painting order for a whole scene is: every shadow(), then every draw().

import { TAU, PI, clamp, lerp, sstep, angDiff, rgba } from './util.js';
import { M } from './anatomy.js';

const LX = -0.55, LY = -0.83;                       // direction towards the light
const OFF = 6000;                                   // shadows are cast by drawing the shape off-screen and offsetting its shadow back
const LEG_PROFILE = [[0, 0.046], [0.2, 0.048], [0.46, 0.032], [0.58, 0.030], [0.8, 0.023], [1, 0.018]];
const fract = x => x - Math.floor(x);
const hash = (a, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

function smoothClosed(g, pts) {
  const n = pts.length;
  g.beginPath();
  g.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let i = 1; i <= n; i++) {
    const a = pts[i % n], b = pts[(i + 1) % n];
    g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  g.closePath();
}

export class DragonRenderer {
  constructor(dragon) {
    this.d = dragon;
    this.bodyPath = null; this.legPath = null; this.wingPaths = [null, null];
    this.palKey = ''; this.P = null;
  }

  palette(theme) {
    const key = this.d.genome.rev + theme.name;
    if (key !== this.palKey) { this.palKey = key; this.P = this.d.genome.palette(theme.dark); }
    return this.P;
  }

  /** Flame-coloured rgba in the dragon's fire hue. */
  fireCol(l, a, dh = 0, s = 100) { return `hsla(${this.d.genome.v.fireHue + dh},${s}%,${l}%,${a})`; }

  // ================================================================== paths
  buildPaths() {
    const d = this.d, S = d.S, L = d.L, an = d.anatomy;
    const bp = this.bodyPath = new Path2D();
    bp.moveTo(S[0].x + S[0].nx * S[0].hw, S[0].y + S[0].ny * S[0].hw);
    for (let j = 1; j < M; j++) bp.lineTo(S[j].x + S[j].nx * S[j].hw, S[j].y + S[j].ny * S[j].hw);
    const tl = S[M - 1];
    bp.lineTo(tl.x - tl.tx * L * 0.012, tl.y - tl.ty * L * 0.012);
    for (let j = M - 1; j >= 0; j--) bp.lineTo(S[j].x - S[j].nx * S[j].hw, S[j].y - S[j].ny * S[j].hw);
    bp.closePath();
    const lp = this.legPath = new Path2D();
    for (const l of d.legs) this.legOutline(l, lp);
    this.wingPaths[0] = this.wingPath(d.wg[0]); this.wingPaths[1] = this.wingPath(d.wg[1]);
  }

  /** The leg's centre-line, rounded at the knee but not a rubber hose, with a width profile. */
  legCurve(l, n) {
    const L = this.d.L, thick = this.d.anatomy.leg.thick, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const cx = 2 * l.kx - 0.5 * (l.ax + l.ex), cy = 2 * l.ky - 0.5 * (l.ay + l.ey);
      const qx = u * u * l.ax + 2 * u * t * cx + t * t * l.ex, qy = u * u * l.ay + 2 * u * t * cy + t * t * l.ey;
      const pu = t < 0.5 ? t * 2 : (t - 0.5) * 2, p0x = t < 0.5 ? l.ax : l.kx, p0y = t < 0.5 ? l.ay : l.ky, p1x = t < 0.5 ? l.kx : l.ex, p1y = t < 0.5 ? l.ky : l.ey;
      pts.push({ x: lerp(qx, lerp(p0x, p1x, pu), 0.6), y: lerp(qy, lerp(p0y, p1y, pu), 0.6), t });
    }
    for (let i = 0; i <= n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], dd = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      pts[i].nx = -(b.y - a.y) / dd; pts[i].ny = (b.x - a.x) / dd;
      let w = LEG_PROFILE[LEG_PROFILE.length - 1][1];
      for (let k = 1; k < LEG_PROFILE.length; k++) if (pts[i].t <= LEG_PROFILE[k][0]) {
        const p0 = LEG_PROFILE[k - 1], p1 = LEG_PROFILE[k];
        w = lerp(p0[1], p1[1], sstep(0, 1, (pts[i].t - p0[0]) / (p1[0] - p0[0]))); break;
      }
      pts[i].w = w * L * thick;
    }
    return pts;
  }
  legOutline(l, p) {
    const c = this.legCurve(l, 16);
    p.moveTo(c[0].x + c[0].nx * c[0].w / 2, c[0].y + c[0].ny * c[0].w / 2);
    for (let i = 1; i < c.length; i++) p.lineTo(c[i].x + c[i].nx * c[i].w / 2, c[i].y + c[i].ny * c[i].w / 2);
    const e = c[c.length - 1];
    p.arc(e.x, e.y, e.w / 2, Math.atan2(e.ny, e.nx), Math.atan2(e.ny, e.nx) + PI, false);
    for (let i = c.length - 1; i >= 0; i--) p.lineTo(c[i].x - c[i].nx * c[i].w / 2, c[i].y - c[i].ny * c[i].w / 2);
    p.closePath();
    return c;
  }

  /** Membrane outline: shoulder, arm, along the first finger, scalloped between fingertips, back to the flank. */
  wingPath(w) {
    const d = this.d, L = d.L, wc = d.anatomy.wing, n = wc.fingers, p = new Path2D();
    const pull = lerp(0.03, 0.1 + 0.2 * wc.scallop, sstep(0.08, 0.5, w.o));      // a folded wing has a smooth, pleated edge, not scallops
    p.moveTo(w.S[0], w.S[1]);
    p.quadraticCurveTo((w.S[0] + w.W[0]) / 2 + w.f[0] * L * 0.012, (w.S[1] + w.W[1]) / 2 + w.f[1] * L * 0.012, w.W[0], w.W[1]);
    p.lineTo(w.joints[0][0], w.joints[0][1]); p.lineTo(w.tips[0][0], w.tips[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const a = w.tips[i], c = w.tips[i + 1], mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
      p.quadraticCurveTo(mx + (w.W[0] - mx) * pull, my + (w.W[1] - my) * pull, c[0], c[1]);
    }
    const a = w.tips[n - 1], bx = (a[0] + w.B[0]) / 2, by = (a[1] + w.B[1]) / 2;
    p.quadraticCurveTo(bx + (w.W[0] - bx) * pull * 0.75, by + (w.W[1] - by) * pull * 0.75, w.B[0], w.B[1]);
    p.closePath();
    return p;
  }

  // ================================================================== shadows
  shadow(g, theme, env) {
    const d = this.d, L = d.L;
    this.buildPaths();
    g.save();
    g.fillStyle = '#000'; g.shadowColor = theme.shadow;
    g.shadowBlur = 16 * env.dpr * (L / 400); g.shadowOffsetX = (OFF + 7 * L / 400) * env.dpr; g.shadowOffsetY = 12 * env.dpr * (L / 400);
    g.translate(-OFF, 0);
    g.fill(this.bodyPath); g.fill(this.legPath);
    g.restore();
    // wings float higher above the page: longer, softer shadow
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.shadowColor = theme.shadow;
    g.shadowBlur = 26 * env.dpr * (L / 400); g.shadowOffsetX = (OFF + (16 + 14 * d.wing) * L / 400) * env.dpr; g.shadowOffsetY = (24 + 18 * d.wing) * L / 400 * env.dpr;
    g.translate(-OFF, 0);
    g.fill(this.wingPaths[0]); g.fill(this.wingPaths[1]);
    g.restore();
    // contact shadows: a planted foot presses into the page, a lifted one leaves it
    g.fillStyle = theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(40,20,6,0.28)';
    for (const l of d.legs) {
      const press = 1 - 0.8 * l.lift;
      g.globalAlpha = 0.55 * press;
      g.beginPath(); g.ellipse(l.ex + 1.5, l.ey + 2.5, L * 0.028 * (0.8 + 0.2 * press), L * 0.02 * (0.8 + 0.2 * press), Math.atan2(l.ty, l.tx), 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }

  // ================================================================== a whole dragon
  draw(g, theme, env) {
    const P = this.palette(theme);
    this.legs(g, P, theme);
    this.body(g, P, theme, env);
    this.spines(g, P, theme);
    this.wing(g, P, 0, theme);
    this.wing(g, P, 1, theme);
    this.head(g, P, theme);
  }

  // ================================================================== legs and feet
  legs(g, P, theme) {
    const d = this.d, L = d.L, lw = Math.max(1.2, L * 0.0028);
    // far legs first so the near ones overlap them
    for (const l of d.legs) {
      this.foot(g, P, l, lw);
      const p = new Path2D(), c = this.legOutline(l, p);
      const gr = g.createLinearGradient(l.ax, l.ay, l.ex, l.ey);
      gr.addColorStop(0, P.skin); gr.addColorStop(0.45, P.skin); gr.addColorStop(1, P.skinDeep);
      g.fillStyle = gr; g.fill(p);
      g.lineJoin = 'round'; g.strokeStyle = P.rim; g.lineWidth = lw; g.stroke(p);
      g.save(); g.clip(p);
      // lit side highlight
      g.strokeStyle = rgba(P.skinLight, 0.5 * Math.min(1.2, d.anatomy.skin.gloss)); g.lineCap = 'round'; g.lineWidth = Math.max(1.4, L * 0.009);
      g.beginPath();
      c.forEach((q, i) => {
        const sgn = (q.nx * LX + q.ny * LY) > 0 ? 1 : -1, x = q.x + q.nx * sgn * q.w * 0.22, y = q.y + q.ny * sgn * q.w * 0.22;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
      // scale ticks across the limb
      g.strokeStyle = rgba(P.rim, 0.3); g.lineWidth = 0.9;
      for (let i = 1; i < c.length - 1; i++) {
        const q = c[i]; g.beginPath();
        g.moveTo(q.x - q.nx * q.w * 0.42, q.y - q.ny * q.w * 0.42);
        g.quadraticCurveTo(q.x + (c[i + 1].x - c[i - 1].x) * 0.35, q.y + (c[i + 1].y - c[i - 1].y) * 0.35, q.x + q.nx * q.w * 0.42, q.y + q.ny * q.w * 0.42);
        g.stroke();
      }
      g.restore();
      // elbow/knee: a rounded joint cap so the bend reads as a joint
      g.fillStyle = P.skin; g.strokeStyle = rgba(P.rim, 0.55); g.lineWidth = 0.9;
      g.beginPath(); g.arc(l.kx, l.ky, L * 0.0165 * d.anatomy.leg.thick, 0, TAU); g.fill(); g.stroke();
    }
  }

  /**
   * The foot is a small articulated hand: a pad at the ankle and 3 to 5 toes, each with two phalanges and a knuckle.
   * l.spread fans the toes (wide as weight lands), l.curl bends and shortens them (curling in flight, peeling at
   * push-off). Webbing joins the toe bases, claws are curved, and a dewclaw sits on the inside.
   */
  foot(g, P, l, lw) {
    const d = this.d, L = d.L, an = d.anatomy, nT = l.front ? an.leg.toesFront : an.leg.toesHind;
    const Fa = Math.atan2(l.ey - l.ky, l.ex - l.kx), Lb = Math.atan2(l.ty, l.tx);
    const k = Lb + 0.55 * angDiff(Fa, Lb);
    const fan = (l.front ? 1.45 : 1.7) * l.spread * (nT === 3 ? 0.78 : nT === 5 ? 1.12 : 1);
    const E = 1 + 0.2 * l.lift, thick = Math.sqrt(an.leg.thick), tw = L * (l.front ? 0.0145 : 0.0135) * E * thick;
    const bx = l.ex + Math.cos(Fa) * L * 0.004, by = l.ey + Math.sin(Fa) * L * 0.004;
    const toes = [];
    for (let c = 0; c < nT; c++) {
      const o = c / (nT - 1) - 0.5, so = Math.sign(o);
      const a1 = k + o * fan;
      const len = L * (l.front ? 0.034 : 0.038) * (1 - 0.35 * Math.abs(o)) * E * (1 - 0.2 * l.curl);
      const l1 = len * 0.56, l2 = len * 0.44 * (1 - 0.3 * l.curl);
      const a2 = a1 - so * (0.12 + 0.55 * l.curl) * (0.4 + 1.6 * Math.abs(o)) + (so === 0 ? 0 : 0);
      const kx = bx + Math.cos(a1) * l1, ky = by + Math.sin(a1) * l1, tx = kx + Math.cos(a2) * l2, ty = ky + Math.sin(a2) * l2;
      toes.push({ a1, a2, kx, ky, tx, ty, so, o });
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    // dewclaw: a short spur on the inside of the foot
    const da = k - l.side * (fan / 2 + 0.7), dl = L * 0.016 * E;
    // webbing between the toe bases
    g.fillStyle = rgba(P.skinDeep, 0.92); g.strokeStyle = rgba(P.rim, 0.7); g.lineWidth = 0.8;
    for (let c = 0; c < nT - 1; c++) {
      const A = toes[c], B = toes[c + 1];
      g.beginPath(); g.moveTo(bx, by); g.lineTo(A.kx, A.ky);
      g.quadraticCurveTo((A.kx + B.kx) / 2 * 0.94 + bx * 0.06, (A.ky + B.ky) / 2 * 0.94 + by * 0.06, B.kx, B.ky);
      g.closePath(); g.fill(); g.stroke();
    }
    for (const pass of [0, 1]) {                                // outline pass, then fill pass: toes read as one soft shape
      g.strokeStyle = pass ? P.skin : P.rim;
      const extra = pass ? 0 : lw * 2;
      g.lineWidth = tw * 0.7 + extra;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(da) * dl, by + Math.sin(da) * dl); g.stroke();
      for (const t of toes) {
        g.lineWidth = tw + extra; g.beginPath(); g.moveTo(bx, by); g.lineTo(t.kx, t.ky); g.stroke();
        g.lineWidth = tw * 0.72 + extra; g.beginPath(); g.moveTo(t.kx, t.ky); g.lineTo(t.tx, t.ty); g.stroke();
      }
      g.fillStyle = pass ? P.skin : P.rim;
      g.beginPath(); g.arc(l.ex, l.ey, L * 0.0098 * E + (pass ? 0 : lw), 0, TAU); g.fill();
    }
    // knuckles and toe pads, lit from the upper left
    g.fillStyle = rgba(P.skinLight, 0.38);
    for (const t of toes) {
      g.beginPath(); g.arc(t.kx + LX * 0.5, t.ky + LY * 0.5, tw * 0.34, 0, TAU); g.fill();
      g.fillStyle = rgba(P.skinDeep, 0.5);
      g.beginPath(); g.arc(t.tx, t.ty, tw * 0.3, 0, TAU); g.fill();
      g.fillStyle = rgba(P.skinLight, 0.38);
    }
    // curved claws
    const cl = L * 0.012 * an.leg.claw;
    g.fillStyle = P.horn; g.strokeStyle = P.rim; g.lineWidth = 0.7;
    const claw = (x, y, a, len, bend, w) => {
      const px = -Math.sin(a), py = Math.cos(a), ex = x + Math.cos(a) * len + px * bend * len * 0.55, ey = y + Math.sin(a) * len + py * bend * len * 0.55;
      g.beginPath(); g.moveTo(x + px * w, y + py * w);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.75 + px * bend * len * 0.15, y + Math.sin(a) * len * 0.75 + py * bend * len * 0.15, ex, ey);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - px * w * 0.1, y + Math.sin(a) * len * 0.5 - py * w * 0.1, x - px * w, y - py * w);
      g.closePath(); g.fill(); g.stroke();
    };
    for (const t of toes) claw(t.tx + Math.cos(t.a2) * tw * 0.2, t.ty + Math.sin(t.a2) * tw * 0.2, t.a2, cl, (t.so || 1) * -0.9 * (0.6 + l.curl), tw * 0.32);
    claw(bx + Math.cos(da) * dl, by + Math.sin(da) * dl, da, cl * 0.75, -l.side * 0.7, tw * 0.26);
  }

  // ================================================================== body
  body(g, P, theme, env) {
    const d = this.d, S = d.S, L = d.L, an = d.anatomy, gloss = an.skin.gloss;
    g.fillStyle = P.skinDeep; g.fill(this.bodyPath);
    // cylinder shading: each slice gets a gradient across the body, highlight leaning toward the light
    for (let j = 0; j < M - 1; j++) {
      const a = S[j], b = S[j + 1];
      let nx = a.nx + b.nx, ny = a.ny + b.ny; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const hw = (a.hw + b.hw) / 2, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const uh = clamp(0.5 - 0.1 * (nx * LX + ny * LY), 0.4, 0.6);
      const gr = g.createLinearGradient(cx + nx * hw, cy + ny * hw, cx - nx * hw, cy - ny * hw);
      gr.addColorStop(0, P.rim); gr.addColorStop(0.05, P.bellyDeep); gr.addColorStop(0.11, P.belly); gr.addColorStop(0.21, P.skin);
      gr.addColorStop(uh - 0.17, P.skin); gr.addColorStop(uh, P.skinLight); gr.addColorStop(uh + 0.17, P.skin);
      gr.addColorStop(0.79, P.skin); gr.addColorStop(0.89, P.belly); gr.addColorStop(0.95, P.bellyDeep); gr.addColorStop(1, P.rim);
      g.fillStyle = gr;
      const e = 0.7;
      g.beginPath();
      g.moveTo(a.x + a.nx * a.hw + a.tx * e, a.y + a.ny * a.hw + a.ty * e);
      g.lineTo(b.x + b.nx * b.hw - b.tx * e, b.y + b.ny * b.hw - b.ty * e);
      g.lineTo(b.x - b.nx * b.hw - b.tx * e, b.y - b.ny * b.hw - b.ty * e);
      g.lineTo(a.x - a.nx * a.hw + a.tx * e, a.y - a.ny * a.hw + a.ty * e);
      g.closePath(); g.fill();
    }
    g.save(); g.clip(this.bodyPath);
    this.pattern(g, P);
    // scale mosaic + belly plates
    const dark = new Path2D(), hi = new Path2D(), plates = new Path2D(), sc = an.skin.scale;
    for (let j = 2; j < M - 1; j++) {
      const s = S[j]; if (s.hw < 3.5) continue;
      const rows = clamp(Math.round(s.hw / (6.5 * sc)), 1, 5), stag = (j & 1) ? 0.5 : 0;
      for (let r = 0; r < rows; r++) {
        const u = ((r + 0.5) / rows * 2 - 1) * 0.74 + (stag ? (1.48 / rows) * 0.25 : 0);
        const qx = s.x + s.nx * u * s.hw, qy = s.y + s.ny * u * s.hw;
        const a = Math.max(2.4, s.hw * 0.74 / rows * 1.05), b = a * 0.95;
        dark.moveTo(qx + s.nx * a, qy + s.ny * a);
        dark.quadraticCurveTo(qx - s.tx * b * 1.7, qy - s.ty * b * 1.7, qx - s.nx * a, qy - s.ny * a);
        hi.moveTo(qx + s.nx * a + LX * 1.1, qy + s.ny * a + LY * 1.1);
        hi.quadraticCurveTo(qx - s.tx * b * 1.7 + LX * 1.1, qy - s.ty * b * 1.7 + LY * 1.1, qx - s.nx * a + LX * 1.1, qy - s.ny * a + LY * 1.1);
      }
      if ((j & 1) === 0) for (const sd of [-1, 1]) {
        plates.moveTo(s.x + s.nx * sd * s.hw * 0.995, s.y + s.ny * sd * s.hw * 0.995);
        plates.lineTo(s.x + s.nx * sd * s.hw * 0.8 - s.tx * 1.5, s.y + s.ny * sd * s.hw * 0.8 - s.ty * 1.5);
      }
    }
    g.lineCap = 'round';
    g.strokeStyle = rgba(P.skinDeep, 0.6); g.lineWidth = Math.max(1, L * 0.002); g.stroke(dark);
    g.strokeStyle = rgba(P.skinLight, 0.4 * Math.min(1.4, 0.4 + gloss * 0.6)); g.lineWidth = Math.max(0.8, L * 0.0016); g.stroke(hi);
    g.strokeStyle = rgba(P.bellyDeep, 0.8); g.lineWidth = 1; g.stroke(plates);
    // specular streak along the lit side
    if (gloss > 0.05) {
      g.strokeStyle = `rgba(255,255,255,${0.1 * gloss})`; g.lineWidth = Math.max(1.2, L * 0.004); g.beginPath();
      for (let j = 4; j < M - 8; j++) {
        const s = S[j], sg = (s.nx * LX + s.ny * LY) > 0 ? 1 : -1, x = s.x + s.nx * sg * s.hw * 0.42, y = s.y + s.ny * sg * s.hw * 0.42;
        j === 4 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    // golden dorsal line
    g.strokeStyle = rgba(P.spike, 0.5); g.lineWidth = Math.max(1.2, L * 0.0032);
    g.beginPath(); g.moveTo(S[6].x, S[6].y);
    for (let j = 7; j < M - 3; j++) g.lineTo(S[j].x, S[j].y);
    g.stroke();
    // throat glow while breathing
    if (d.breath > 0.05) {
      for (let j = 0; j < 20; j += 3) {
        const q = S[j], r = q.hw * 1.15, gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        gr.addColorStop(0, this.fireCol(66, 0.55 * d.breath * (1 - j / 20))); gr.addColorStop(1, this.fireCol(52, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, r, 0, TAU); g.fill();
      }
    }
    // the light of the fire itself on the near side of the body
    const pt = env.particles;
    if (pt && pt.fireW > 4) {
      const r = L * 0.75, gr = g.createRadialGradient(pt.fireX, pt.fireY, 0, pt.fireX, pt.fireY, r);
      gr.addColorStop(0, this.fireCol(62, 0.42 * clamp(pt.fireW / 40, 0, 1))); gr.addColorStop(1, this.fireCol(50, 0));
      g.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over'; g.fillStyle = gr;
      g.fillRect(pt.fireX - r, pt.fireY - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
    }
    g.restore();
    // outline
    g.lineJoin = 'round';
    g.strokeStyle = P.rim; g.lineWidth = Math.max(1.6, L * 0.0042); g.stroke(this.bodyPath);
    if (P.rimLight) { g.strokeStyle = P.rimLight; g.lineWidth = 1; g.stroke(this.bodyPath); }
  }

  /** Markings. Positions come from hashing the spine index, so a pattern rides with the body instead of swimming. */
  pattern(g, P) {
    const d = this.d, S = d.S, L = d.L, sk = d.anatomy.skin;
    if (sk.pattern === 'none' || sk.amount <= 0.01) return;
    const amt = sk.amount, sc = sk.scale;
    g.lineCap = 'round';
    if (sk.pattern === 'bands') {
      const step = Math.max(3, Math.round(7 * sc));
      g.fillStyle = rgba(P.pattern, 0.55 * amt);
      for (let j = 4; j < M - 2; j += step) {
        const s = S[j], w = s.hw * (0.9 + 0.1 * hash(j)), bw = Math.max(1.5, step * (L / (M - 1)) * 0.5);
        g.beginPath();
        g.moveTo(s.x + s.nx * w, s.y + s.ny * w);
        g.quadraticCurveTo(s.x - s.tx * bw * 1.6, s.y - s.ty * bw * 1.6, s.x - s.nx * w, s.y - s.ny * w);
        g.quadraticCurveTo(s.x - s.tx * bw * 0.4, s.y - s.ty * bw * 0.4, s.x + s.nx * w, s.y + s.ny * w);
        g.closePath(); g.fill();
      }
    } else if (sk.pattern === 'stripes') {
      g.strokeStyle = rgba(P.pattern, 0.65 * amt); g.lineWidth = Math.max(1.2, L * 0.004 * sc);
      for (let j = 4; j < M - 2; j += 3) {
        const s = S[j];
        for (const u of [-0.55, 0.05, 0.6]) {
          if (hash(j, u * 10) < 0.35) continue;
          const a = u + (hash(j, 2) - 0.5) * 0.2, len = s.hw * 0.4;
          g.beginPath(); g.moveTo(s.x + s.nx * (a - 0.18) * s.hw, s.y + s.ny * (a - 0.18) * s.hw);
          g.lineTo(s.x + s.nx * (a + 0.18) * s.hw - s.tx * len * 0.5, s.y + s.ny * (a + 0.18) * s.hw - s.ty * len * 0.5); g.stroke();
        }
      }
    } else {
      const ring = sk.pattern === 'rosettes';
      for (let j = 5; j < M - 3; j += 3) {
        const s = S[j];
        for (let k = 0; k < 3; k++) {
          if (hash(j, k + 7) < 0.3) continue;
          const u = (hash(j, k) * 2 - 1) * 0.72, r = Math.max(1.4, s.hw * (0.12 + 0.12 * hash(j, k + 3)) * sc);
          const qx = s.x + s.nx * u * s.hw, qy = s.y + s.ny * u * s.hw;
          if (ring) {
            g.strokeStyle = rgba(P.pattern, 0.8 * amt); g.lineWidth = Math.max(1, r * 0.42);
            g.beginPath(); g.arc(qx, qy, r, 0, TAU); g.stroke();
            g.fillStyle = rgba(P.patternLight, 0.45 * amt); g.beginPath(); g.arc(qx, qy, r * 0.5, 0, TAU); g.fill();
          } else {
            g.fillStyle = rgba(P.pattern, 0.75 * amt); g.beginPath(); g.ellipse(qx, qy, r * 1.3, r, Math.atan2(s.ty, s.tx), 0, TAU); g.fill();
          }
        }
      }
    }
  }

  // ================================================================== spines and tail blade
  spines(g, P) {
    const d = this.d, S = d.S, L = d.L, sp = d.anatomy.spine;
    g.lineJoin = 'round';
    if (sp.size > 0.03) {
      g.strokeStyle = P.rim; g.lineWidth = 1;
      let acc = 0, alt = 0, prev = null;
      for (let j = 6; j < M - 3; j++) {
        const s = S[j]; acc += L / (M - 1);
        const ds = Math.max(7, s.hw * 0.78) * sp.gap * (sp.shape === 'fin' ? 1.25 : 1);
        if (acc < ds) continue;
        acc = 0; alt ^= 1;
        const p = S[j - 1], q = S[Math.min(M - 1, j + 1)];
        const curve = (p.tx * q.ty - p.ty * q.tx) * 6;
        let len = (s.hw * 0.66 + L * 0.009) * (alt ? 1 : 0.88) * sp.size, w = (s.hw * 0.3 + 1.6) * Math.sqrt(sp.size);
        const bx = s.x - s.tx * len * 1.1 + s.nx * curve * len * 0.35, by = s.y - s.ty * len * 1.1 + s.ny * curve * len * 0.35;
        const gr = g.createLinearGradient(s.x, s.y, bx, by);
        gr.addColorStop(0, P.bellyDeep); gr.addColorStop(1, P.spike);
        g.fillStyle = gr;
        g.beginPath();
        if (sp.shape === 'horn') {
          // a hooked horn that curls back along the spine
          const hx = s.x - s.tx * len * 1.25 + s.nx * (curve * len * 0.3 + (alt ? 1 : -1) * len * 0.16), hy = s.y - s.ty * len * 1.25 + s.ny * (curve * len * 0.3 + (alt ? 1 : -1) * len * 0.16);
          g.moveTo(s.x + s.nx * w, s.y + s.ny * w);
          g.quadraticCurveTo(s.x - s.tx * len * 0.2 + s.nx * w * 0.2, s.y - s.ty * len * 0.2 + s.ny * w * 0.2, hx, hy);
          g.quadraticCurveTo(s.x - s.tx * len * 0.8, s.y - s.ty * len * 0.8, s.x - s.nx * w, s.y - s.ny * w);
        } else if (sp.shape === 'fin') {
          // a sail panel with a rib
          const w2 = w * 2.1, tx = s.x - s.tx * len * 0.9, ty = s.y - s.ty * len * 0.9;
          g.moveTo(s.x + s.nx * w2 * 0.35 + s.tx * w2 * 0.5, s.y + s.ny * w2 * 0.35 + s.ty * w2 * 0.5);
          g.quadraticCurveTo(tx + s.tx * len * 0.1, ty + s.ty * len * 0.1, bx, by);
          g.quadraticCurveTo(tx - s.tx * len * 0.6, ty - s.ty * len * 0.6, s.x - s.tx * w2 * 1.2, s.y - s.ty * w2 * 1.2);
          g.lineTo(s.x - s.nx * w2 * 0.35, s.y - s.ny * w2 * 0.35);
        } else {
          g.moveTo(s.x + s.nx * w, s.y + s.ny * w); g.lineTo(bx, by); g.lineTo(s.x - s.nx * w, s.y - s.ny * w);
        }
        g.closePath(); g.fill(); g.stroke();
        if (sp.shape === 'fin') { g.strokeStyle = rgba(P.rim, 0.5); g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(bx, by); g.stroke(); g.strokeStyle = P.rim; }
        prev = s;
      }
    }
    // tail blade (a taper when the gene is off)
    const t = S[M - 1], t2 = S[M - 6], ang = Math.atan2(t.y - t2.y, t.x - t2.x), bl = sp.blade;
    g.save(); g.translate(t.x, t.y); g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, L * 0.09, 0);
    gr.addColorStop(0, P.skin); gr.addColorStop(0.35, P.spike); gr.addColorStop(1, P.bellyDeep);
    g.fillStyle = gr; g.strokeStyle = P.rim; g.lineWidth = 1.3;
    g.beginPath();
    if (bl > 0.05) {
      const k = bl;
      g.moveTo(-L * 0.01, 0);
      g.bezierCurveTo(L * 0.015, -L * 0.04 * k, L * 0.06, -L * 0.034 * k, L * (0.04 + 0.055 * Math.min(1.3, k)), 0);
      g.bezierCurveTo(L * 0.06, L * 0.034 * k, L * 0.015, L * 0.04 * k, -L * 0.01, 0);
    } else {
      g.moveTo(-L * 0.01, -L * 0.004); g.lineTo(L * 0.03, 0); g.lineTo(-L * 0.01, L * 0.004);
    }
    g.closePath(); g.fill(); g.stroke();
    if (bl > 0.05) { g.strokeStyle = rgba(P.rim, 0.55); g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(L * (0.03 + 0.055 * Math.min(1.3, bl)), 0); g.stroke(); }
    g.restore();
  }

  // ================================================================== wings
  /**
   * A wing is an arm with a wrist and n fingers. Each finger has two bones and a knuckle. The membrane is
   * stretched between fingertips with scalloped edges, braced by radial veins, and a hooked thumb claw sits at the wrist.
   */
  wing(g, P, idx, theme) {
    const d = this.d, L = d.L, w = d.wg[idx], wc = d.anatomy.wing, n = wc.fingers, path = this.wingPaths[idx];
    const mid = w.tips[Math.floor((n - 1) / 2)], mid2 = w.tips[Math.ceil((n - 1) / 2)];
    const mx = (mid[0] + mid2[0]) / 2, my = (mid[1] + mid2[1]) / 2;
    const alpha = Math.max(clamp(0.42 + 0.6 * wc.membrane, 0.4, 1), 0.96 - 1.4 * w.o);
    const grad = g.createLinearGradient(w.S[0], w.S[1], mx, my);
    grad.addColorStop(0, P.wingA); grad.addColorStop(0.55, P.wingA); grad.addColorStop(1, P.wingB);
    g.save();
    g.globalAlpha = alpha; g.fillStyle = grad; g.fill(path);
    g.globalAlpha = 1;
    // light through the membrane: a warm sheen near the trailing edge when the wing is spread
    if (w.o > 0.3) {
      g.save(); g.clip(path);
      const sg = g.createRadialGradient(w.W[0], w.W[1], 0, w.W[0], w.W[1], L * 0.5 * wc.span);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(1, rgba(P.wingB, 0.35 * w.o * (1.1 - alpha + 0.3)));
      g.fillStyle = sg; g.fillRect(w.W[0] - L, w.W[1] - L, L * 2, L * 2);
      g.restore();
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = rgba(P.wingVein, 0.85); g.lineWidth = Math.max(1.2, L * 0.0025); g.stroke(path);
    // radial veins fan from each finger's knuckle toward the scalloped edge
    g.strokeStyle = rgba(P.wingVein, 0.3); g.lineWidth = 1; g.beginPath();
    for (let i = 0; i < n - 1; i++) {
      const a = w.tips[i], b = w.tips[i + 1], ja = w.joints[i];
      for (let k = 1; k < 4; k++) {
        const f = k / 4, ex = lerp(a[0], b[0], f), ey = lerp(a[1], b[1], f);
        g.moveTo(lerp(ja[0], w.W[0], 0.3), lerp(ja[1], w.W[1], 0.3)); g.lineTo(ex + (w.W[0] - ex) * 0.1, ey + (w.W[1] - ey) * 0.1);
      }
    }
    // veins into the trailing flap
    const last = w.tips[n - 1];
    for (let k = 1; k < 3; k++) {
      const f = k / 3, ex = lerp(last[0], w.B[0], f), ey = lerp(last[1], w.B[1], f);
      g.moveTo(w.W[0] + (ex - w.W[0]) * 0.3, w.W[1] + (ey - w.W[1]) * 0.3); g.lineTo(ex + (w.W[0] - ex) * 0.12, ey + (w.W[1] - ey) * 0.12);
    }
    g.stroke();
    // arm
    const arm = Math.max(2.4, L * 0.013 * lerp(0.6, 1, w.o));
    const bone = (x0, y0, x1, y1, lw) => {
      g.strokeStyle = P.wingVein; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = rgba(P.skinLight, 0.4); g.lineWidth = Math.max(0.8, lw * 0.28); g.beginPath(); g.moveTo(x0 + LX, y0 + LY); g.lineTo(x1 + LX, y1 + LY); g.stroke();
    };
    const am = [(w.S[0] + w.W[0]) / 2 + w.f[0] * L * 0.012, (w.S[1] + w.W[1]) / 2 + w.f[1] * L * 0.012];
    bone(w.S[0], w.S[1], am[0], am[1], arm); bone(am[0], am[1], w.W[0], w.W[1], arm * 0.92);
    // fingers: two bones each, tapering, with a knuckle
    for (let i = 0; i < n; i++) {
      const lw = Math.max(1.4, L * (0.0078 - i * 0.0009)), j = w.joints[i], t = w.tips[i];
      bone(w.W[0], w.W[1], j[0], j[1], lw); bone(j[0], j[1], t[0], t[1], lw * 0.62);
      g.fillStyle = P.skin; g.strokeStyle = rgba(P.rim, 0.7); g.lineWidth = 0.8;
      g.beginPath(); g.arc(j[0], j[1], Math.max(1.4, lw * 0.62), 0, TAU); g.fill(); g.stroke();
      g.fillStyle = P.wingVein; g.beginPath(); g.arc(t[0], t[1], Math.max(0.9, lw * 0.34), 0, TAU); g.fill();
    }
    // thumb claw at the wrist: a hooked, curved claw
    const o = lerp(0.3, 1, w.o), cd = w.dir(w.armTh - 0.95), nrm = [-cd[1], cd[0]];
    const cl = L * 0.05 * o, cw = Math.max(2.6, L * 0.0075);
    g.fillStyle = P.horn; g.strokeStyle = P.rim; g.lineWidth = 1;
    g.beginPath(); g.moveTo(w.W[0] + nrm[0] * cw, w.W[1] + nrm[1] * cw);
    g.quadraticCurveTo(w.W[0] + cd[0] * cl * 0.55 + nrm[0] * cw * 0.4, w.W[1] + cd[1] * cl * 0.55 + nrm[1] * cw * 0.4, w.W[0] + cd[0] * cl + nrm[0] * cl * 0.22, w.W[1] + cd[1] * cl + nrm[1] * cl * 0.22);
    g.quadraticCurveTo(w.W[0] + cd[0] * cl * 0.5 - nrm[0] * cw * 0.2, w.W[1] + cd[1] * cl * 0.5 - nrm[1] * cw * 0.2, w.W[0] - nrm[0] * cw, w.W[1] - nrm[1] * cw);
    g.closePath(); g.fill(); g.stroke();
    // wrist and shoulder joints
    const kn = lerp(0.62, 1, w.o);
    g.fillStyle = P.skin; g.strokeStyle = P.rim; g.lineWidth = 1;
    g.beginPath(); g.arc(w.W[0], w.W[1], Math.max(2.4, L * 0.012 * kn), 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.arc(w.S[0], w.S[1], Math.max(2.6, L * 0.014 * kn), 0, TAU); g.fill(); g.stroke();
    g.restore();
  }

  // ================================================================== head
  head(g, P, theme) {
    const d = this.d, p = d.S[0], L = d.L, an = d.anatomy, pose = d.pose;
    const j = clamp(d.breath * 0.92 + 0.035 * Math.sin(d.time * 1.7) + pose.jaw * 0.85, 0, 1);
    const sn = an.head.snout, PV = 0.04, X = x => (x > PV ? PV + (x - PV) * sn : x);
    const hornK = an.head.horns, frillK = an.head.frill, cheekK = an.head.cheeks;
    g.save();
    g.translate(p.x, p.y); g.rotate(d.headAng); g.scale(L * an.head.size, L * an.head.size);
    const px = v => v / (L * an.head.size);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = P.rim; g.lineWidth = px(1.3);
    const S2 = (x, y, k, ox, oy) => [ox + (x - ox) * k, oy + (y - oy) * k];

    for (const s of [-1, 1]) {
      // ear frills: ribs and a scalloped membrane
      if (frillK > 0.03) {
        const f = (x, y) => S2(X(x), s * y, frillK, 0.004, s * 0.034);
        const fg = g.createLinearGradient(0, 0, -0.09 * frillK, s * 0.08 * frillK);
        fg.addColorStop(0, P.wingA); fg.addColorStop(1, P.wingB);
        g.fillStyle = fg;
        const q = [f(0.012, 0.04), f(-0.03, 0.05), f(-0.078, 0.09), f(-0.082, 0.07), f(-0.098, 0.066), f(-0.08, 0.058), f(-0.09, 0.04), f(-0.06, 0.044), f(-0.05, 0.03), f(0, 0.03)];
        g.beginPath(); g.moveTo(q[0][0], q[0][1]);
        g.quadraticCurveTo(q[1][0], q[1][1], q[2][0], q[2][1]); g.quadraticCurveTo(q[3][0], q[3][1], q[4][0], q[4][1]);
        g.quadraticCurveTo(q[5][0], q[5][1], q[6][0], q[6][1]); g.quadraticCurveTo(q[7][0], q[7][1], q[8][0], q[8][1]);
        g.lineTo(q[9][0], q[9][1]); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = rgba(P.wingVein, 0.7); g.lineWidth = px(1.1);
        for (const e of [f(-0.078, 0.09), f(-0.098, 0.066), f(-0.09, 0.04)]) { g.beginPath(); g.moveTo(0.004, s * 0.036); g.lineTo(0.004 + (e[0] - 0.004) * 0.96, s * 0.036 + (e[1] - s * 0.036) * 0.96); g.stroke(); }
        g.strokeStyle = P.rim; g.lineWidth = px(1.3);
      }
      // main horns, swept back, ivory to dark at the base
      if (hornK > 0.03) {
        const h = (x, y) => S2(x, s * y, hornK, 0.016, s * 0.036);
        const hg = g.createLinearGradient(0.012, 0, -0.13 * hornK, 0);
        hg.addColorStop(0, P.hornDark); hg.addColorStop(0.5, P.horn); hg.addColorStop(1, P.horn);
        g.fillStyle = hg;
        const a = h(-0.03, 0.078), b = h(-0.095, 0.09), c = h(-0.142, 0.05), e = h(-0.092, 0.07), f2 = h(-0.03, 0.056);
        g.beginPath(); g.moveTo(0.016, s * 0.036);
        g.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]); g.bezierCurveTo(e[0], e[1], f2[0], f2[1], -0.004, s * 0.026);
        g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = rgba(P.hornDark, 0.65); g.lineWidth = px(1);
        for (let r = 1; r <= 3; r++) { const x = 0.004 - r * 0.026 * hornK, y = s * (0.052 + r * 0.007 * hornK); g.beginPath(); g.moveTo(x, y - s * 0.008); g.lineTo(x - 0.003, y + s * 0.006); g.stroke(); }
        g.strokeStyle = P.rim; g.lineWidth = px(1.3);
      }
      // cheek spines
      if (cheekK > 0.03) {
        g.fillStyle = P.spike;
        for (const [x, y, tx, ty] of [[0.046, 0.044, 0.026, 0.074], [0.02, 0.046, -0.002, 0.07]]) {
          const t = S2(tx, ty, cheekK, x, y);
          g.beginPath(); g.moveTo(X(x), s * y); g.lineTo(X(t[0]), s * t[1]); g.lineTo(X(x) - 0.016, s * (y - 0.002)); g.closePath(); g.fill(); g.stroke();
        }
      }
    }

    // lower jaw and mouth
    const jx = X(0.122) + 0.02 * j;
    const jg = g.createLinearGradient(0, -0.03, 0, 0.03);
    jg.addColorStop(0, P.skinDeep); jg.addColorStop(0.5, P.skin); jg.addColorStop(1, P.skinDeep);
    g.fillStyle = jg;
    smoothClosed(g, [[-0.012, -0.029], [X(0.04), -0.032], [X(0.082), -0.024 - 0.005 * j], [jx, 0], [X(0.082), 0.024 + 0.005 * j], [X(0.04), 0.032], [-0.012, 0.029]]);
    g.fill(); g.stroke();
    if (j > 0.05) {
      g.fillStyle = P.mouth;
      g.beginPath(); g.moveTo(X(0.05), -0.018); g.quadraticCurveTo(X(0.09), -0.019, jx - 0.006, 0); g.quadraticCurveTo(X(0.09), 0.019, X(0.05), 0.018); g.closePath(); g.fill();
      g.fillStyle = P.tongue;
      const wob = 0.003 * Math.sin(d.time * 9);
      g.beginPath(); g.moveTo(X(0.06), -0.005); g.quadraticCurveTo(X(0.09), -0.012 + wob, jx - 0.012, -0.003);
      g.lineTo(jx - 0.004, 0); g.lineTo(jx - 0.012, 0.004); g.quadraticCurveTo(X(0.09), 0.012 - wob, X(0.06), 0.005); g.closePath(); g.fill();
      if (d.breath > 0.05) {
        const gx = X(0.108), gr = g.createRadialGradient(gx, 0, 0, gx, 0, 0.07);
        gr.addColorStop(0, this.fireCol(78, 0.95 * d.breath)); gr.addColorStop(0.5, this.fireCol(58, 0.5 * d.breath)); gr.addColorStop(1, this.fireCol(52, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(gx, 0, 0.07, 0, TAU); g.fill();
      }
    }

    // upper skull, shaded like a rounded form
    const tipx = X(0.118) - 0.013 * j;
    const sg = g.createLinearGradient(0, -0.045, 0, 0.045);
    sg.addColorStop(0, P.skinDeep); sg.addColorStop(0.3, P.skin); sg.addColorStop(0.5, P.skinLight); sg.addColorStop(0.7, P.skin); sg.addColorStop(1, P.skinDeep);
    g.fillStyle = sg; g.strokeStyle = P.rim; g.lineWidth = px(1.5);
    smoothClosed(g, [[-0.03, -0.034], [-0.004, -0.047], [0.028, -0.043], [X(0.058), -0.033], [X(0.09), -0.022], [tipx - 0.004, -0.0125], [tipx + 0.004, 0], [tipx - 0.004, 0.0125], [X(0.09), 0.022], [X(0.058), 0.033], [0.028, 0.043], [-0.004, 0.047], [-0.03, 0.034]]);
    g.fill(); g.stroke();
    g.strokeStyle = rgba(P.skinDeep, 0.55); g.lineWidth = px(1);
    for (let x = -0.02; x < tipx - 0.012; x += 0.014) {
      const w = 0.04 * (1 - Math.max(0, (x - 0.02) / (0.1 * sn))) + 0.004;
      g.beginPath(); g.moveTo(x, -w * 0.8); g.quadraticCurveTo(x - 0.007, 0, x, w * 0.8); g.stroke();
    }
    g.strokeStyle = rgba(P.spike, 0.75); g.lineWidth = px(1.6);
    g.beginPath(); g.moveTo(-0.028, 0); g.lineTo(tipx - 0.012, 0); g.stroke();
    // teeth
    if (j > 0.12) {
      g.fillStyle = P.horn; g.strokeStyle = rgba(P.rim, 0.8); g.lineWidth = px(0.8);
      for (const s of [-1, 1]) for (const x0 of [0.058, 0.07, 0.082, 0.094, 0.104 - 0.013 * j]) {
        const x = X(x0), wy = Math.max(0.008, 0.033 - (x0 - 0.058) * 0.5);
        g.beginPath(); g.moveTo(x - 0.005, s * wy); g.lineTo(x + 0.001, s * (wy - 0.011)); g.lineTo(x + 0.005, s * wy); g.closePath(); g.fill(); g.stroke();
      }
    }
    // closed mouth: a lip line with a faint upturn at the corner, and the lower fangs showing over the lip
    for (const s of [-1, 1]) {
      if (j < 0.5) {
        const k = 1 - j * 2;
        g.strokeStyle = rgba(P.rim, 0.55 * k); g.lineWidth = px(1.1);
        g.beginPath(); g.moveTo(tipx - 0.006, s * 0.0125); g.quadraticCurveTo(X(0.07), s * 0.0235, X(0.05), s * 0.0305); g.quadraticCurveTo(0.036, s * 0.034, 0.03, s * 0.0345); g.stroke();
        g.strokeStyle = rgba(P.skinDeep, 0.7 * k); g.lineWidth = px(1);
        g.beginPath(); g.moveTo(0.032, s * 0.0345); g.quadraticCurveTo(0.026, s * 0.0375, 0.021, s * 0.0365); g.stroke();
      }
      if (j <= 0.12) {
        g.fillStyle = P.horn; g.strokeStyle = rgba(P.rim, 0.8); g.lineWidth = px(0.8);
        for (const x0 of [0.086, 0.064]) { const x = X(x0), wy = 0.0245 - (x0 - 0.064) * 0.45, h = x0 > 0.07 ? 0.0085 : 0.006;
          g.beginPath(); g.moveTo(x - 0.0035, s * (wy - 0.001)); g.lineTo(x + 0.0005, s * (wy + h)); g.lineTo(x + 0.0035, s * (wy - 0.001)); g.closePath(); g.fill(); g.stroke(); }
      }
    }
    // lower teeth when the jaw is open
    if (j > 0.3) {
      g.fillStyle = P.horn; g.strokeStyle = rgba(P.rim, 0.8); g.lineWidth = px(0.8);
      for (const s of [-1, 1]) for (const x0 of [0.06, 0.074, 0.088]) {
        const x = X(x0) + 0.01 * j, wy = 0.021 - (x0 - 0.06) * 0.35;
        g.beginPath(); g.moveTo(x - 0.0045, s * wy); g.lineTo(x, s * (wy - 0.0085)); g.lineTo(x + 0.0045, s * wy); g.closePath(); g.fill(); g.stroke();
      }
    }
    // raised nostril nodules
    for (const s of [-1, 1]) {
      const ng = g.createRadialGradient(tipx - 0.008, s * 0.0075, 0, tipx - 0.008, s * 0.0075, 0.0058);
      ng.addColorStop(0, P.skinLight); ng.addColorStop(1, rgba(P.skin, 0));
      g.fillStyle = ng; g.beginPath(); g.arc(tipx - 0.008, s * 0.0075, 0.0058, 0, TAU); g.fill();
    }
    // nostrils flare when sniffing; brow ridges
    for (const s of [-1, 1]) {
      g.fillStyle = P.rim;
      g.beginPath(); g.ellipse(tipx - 0.006, s * 0.0062, 0.0027 * (1 + 0.7 * pose.sniff), 0.0016 * (1 + 0.9 * pose.sniff), 0, 0, TAU); g.fill();
      // the brow: lowered and heavy while breathing fire, lifted when curious
      const bl = 0.6 * d.breath - 0.5 * pose.sniff, by = s * 0.0035 * bl;
      g.strokeStyle = P.skinDeep; g.lineWidth = 0.0085 + 0.003 * Math.max(0, bl);
      g.beginPath(); g.moveTo(0.012, s * 0.043); g.quadraticCurveTo(0.03, s * (0.037 - 0.0045 * bl), X(0.05), s * 0.022 - by); g.stroke();
      g.strokeStyle = rgba(P.skinLight, 0.55); g.lineWidth = 0.0024;
      g.beginPath(); g.moveTo(0.016, s * 0.0415); g.quadraticCurveTo(0.031, s * (0.0355 - 0.0045 * bl), X(0.048), s * 0.0215 - by); g.stroke();
    }
    // eyes: follow the target, blink, droop when sleepy, glow when breathing
    const lookLocal = d.lookOn ? angDiff(Math.atan2(d.look.y - p.y, d.look.x - p.x), d.headAng) : 0;
    const blink = d.blinkT >= 0 ? Math.sin(clamp(d.blinkT / 0.2, 0, 1) * PI) : 0;
    const lid = Math.max(blink, pose.eyeClose);
    for (const s of [-1, 1]) {
      const ex = 0.036, ey = s * 0.028, rx = 0.0098, ry = 0.0078 * (1 - 0.92 * lid) * (1 - 0.3 * d.breath);
      const sk = g.createRadialGradient(ex, ey, rx * 0.6, ex, ey, rx * 1.9);
      sk.addColorStop(0, rgba(P.rim, 0.5)); sk.addColorStop(1, rgba(P.rim, 0));
      g.fillStyle = sk; g.beginPath(); g.arc(ex, ey, rx * 1.9, 0, TAU); g.fill();
      if (d.breath > 0.1) {
        const gr = g.createRadialGradient(ex, ey, 0, ex, ey, 0.026);
        gr.addColorStop(0, this.fireCol(70, 0.75 * d.breath)); gr.addColorStop(1, this.fireCol(54, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(ex, ey, 0.026, 0, TAU); g.fill();
      }
      const eg = g.createRadialGradient(ex, ey, 0, ex, ey, rx);
      eg.addColorStop(0, P.eyeCore); eg.addColorStop(0.55, P.eye); eg.addColorStop(1, P.eyeDeep);
      g.fillStyle = eg; g.strokeStyle = P.rim; g.lineWidth = px(1.1);
      g.beginPath(); g.ellipse(ex, ey, rx, Math.max(0.0008, ry), 0, 0, TAU); g.fill(); g.stroke();
      if (lid < 0.85) {
        const ox = Math.cos(lookLocal) * 0.0022, oy = Math.sin(lookLocal) * 0.0034;
        g.fillStyle = '#0a0403';
        g.beginPath(); g.ellipse(ex + ox, ey + oy, 0.0016 + 0.0012 * d.breath + 0.0006 * pose.sniff, ry * 0.92, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(ex - 0.0026, ey - 0.0027, 0.0012, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(ex + 0.0028, ey + 0.0026, 0.0006, 0, TAU); g.fill();
      }
      // the lid: skin drawn over the top of the eye, heavier the sleepier it is
      if (pose.eyeClose > 0.05 && lid < 0.98) {
        g.fillStyle = P.skin; g.beginPath(); g.ellipse(ex, ey - s * 0.0, rx * 1.1, 0.0076 * 0.5 * pose.eyeClose * 1.15, 0, 0, TAU); g.fill();
      }
    }
    g.restore();
  }
}
