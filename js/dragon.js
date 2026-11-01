// One dragon: its body kinematics. A Dragon owns a Genome (what it looks like), an Anatomy (the numbers derived
// from it), a Brain (what it wants) and rigs for the spine, legs, wings and head. It does not draw itself;
// see DragonRenderer for that.

import { TAU, PI, clamp, lerp, sstep, angDiff, rr } from './util.js';
import { Anatomy, N, SUB, M } from './anatomy.js';
import { Brain } from './brain.js';

const TS = 2;                              // spacing of the head's breadcrumb trail, px
let nextId = 1;

export class Leg {
  constructor(front, side, pair, frac) {
    Object.assign(this, { front, side, pair, frac, sw: null, lift: 0, fx: 0, fy: 0, curl: 0, spread: 1, stance: 0 });
  }
}

export class Dragon {
  constructor(world, genome, opts = {}) {
    this.id = nextId++;
    this.world = world;
    this.genome = genome;
    this.anatomy = new Anatomy(genome);
    this.name = opts.name || `Dragon ${this.id}`;
    this.L = 400; this.bodyL = 400;

    this.trail = [];
    this.C = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
    this.S = Array.from({ length: M }, () => ({ x: 0, y: 0, tx: 1, ty: 0, nx: 0, ny: 1, hw: 0, t: 0 }));

    this.x = 0; this.y = 0; this.h = 0; this.v = 0; this.w = 0; this.turnSign = 0;
    this.dist = 0; this.phase = 0; this.time = 0; this.steps = 0;
    this.headYaw = 0; this.headYawV = 0; this.headAng = 0;
    this.look = { x: 0, y: 0 }; this.lookOn = false;
    this.breath = 0; this.wing = 0.07; this.wphase = 0; this.flap = 0.03;
    this.blinkT = -1; this.nextBlink = rr(1, 3); this.nextPuff = rr(1, 3); this.emit = 0; this.sparkAcc = 0;
    this.mouth = { x: 0, y: 0 };
    this.pose = { jaw: 0, sniff: 0, eyeClose: 0, shake: 0, tail: 0, breathAmp: 1, breathRate: 1, flare: 0 };
    this.legs = [
      new Leg(true, -1, 0, 0), new Leg(true, 1, 1, 0),
      new Leg(false, -1, 1, 0), new Leg(false, 1, 0, 0)
    ];
    this.wg = [null, null];
    this.hips = [];
    this.brain = new Brain(this);
    this.sync();
  }

  // ---------------------------------------------------------------- setup
  /** Re-derive anatomy and unit length when the genome or the viewport changed. */
  sync(force = false) {
    const w = this.world;
    const L = w.baseL * this.genome.v.size * w.countScale;
    if (force || this.anatomy.rev !== this.genome.rev) this.anatomy.rebuild(this.genome);
    this.L = L; this.bodyL = L * this.genome.v.length;
    this.legs[0].frac = this.legs[1].frac = this.anatomy.shoulderT;
    this.legs[2].frac = this.legs[3].frac = this.anatomy.hipT;
  }

  /** Put the dragon down walking at (x, y) heading h, with a straight body behind it. */
  place(x, y, h, speedK = 0) {
    this.sync(true);
    this.x = x; this.y = y; this.h = h; this.v = speedK * 0.46 * this.L; this.w = 0; this.turnSign = 0;
    this.trail.length = 0;
    for (let d = this.bodyL * 1.25; d >= 0; d -= TS) this.trail.push({ x: x - Math.cos(h) * d, y: y - Math.sin(h) * d });
    this.dist = 0; this.phase = 0; this.headYaw = 0; this.headYawV = 0; this.breath = 0; this.wing = 0.07;
    this.buildGeometry();
    this.headAng = Math.atan2(this.S[0].ty, this.S[0].tx);
    this.updateLegs(0);
    for (const l of this.legs) { l.fx = l.px; l.fy = l.py; }
    this.updateLegs(0);
    this.updateWingGeom();
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    this.time += dt;
    this.sync();
    const cmd = this.brain.update(dt);
    this.cmd = cmd;
    this.steer(cmd, dt);
    this.move(dt);
    this.buildGeometry();
    this.updateHead(cmd, dt);
    this.updateBreath(cmd, dt);
    this.updatePose(cmd, dt);
    this.updateWings(cmd, dt);
    this.updateLegs(dt);
    this.updateWingGeom();
    this.updateEmission(dt);
  }

  // ---------------------------------------------------------------- steering
  steer(cmd, dt) {
    const g = this.genome.v, L = this.L;
    const vc = 0.46 * L * g.speed * (cmd.speed ?? 1);
    const rmin = (0.14 * L) / g.agility;
    let vd = 0, wTarget = null, err = 0;

    if (cmd.mode === 'curl') {
      // walk a circle: the body wraps around itself and the head comes to rest beside the tail
      vd = vc * (cmd.curl.speed ?? 0.3);
      wTarget = cmd.curl.dir * clamp(this.v, 0.02 * L, 1e9) / (cmd.curl.r * L);
    } else if (cmd.mode === 'hold') {
      vd = 0;
    } else {
      const tx = cmd.tx, ty = cmd.ty, stand = cmd.stand ?? 0.1 * L;
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      err = d > 1 ? angDiff(Math.atan2(dy, dx), this.h) : 0;
      this.goalDist = d;
      if (d > stand) {
        vd = vc * sstep(stand, stand + 0.4 * L, d);
        if (d > stand * 1.2 + 0.05 * L) vd = Math.max(vd, 0.2 * vc);
        vd *= lerp(1, 0.42, sstep(0.5, 2.4, Math.abs(err)));
      }
      if (cmd.minSpeed) vd = Math.max(vd, cmd.minSpeed * 0.46 * L);
    }
    const acc = 1.3 * 0.46 * L, dec = 1.8 * 0.46 * L;
    this.v += clamp(vd - this.v, -dec * dt, acc * dt);
    this.v = Math.max(this.v, 0);

    if (wTarget === null) {
      // committed turning when the goal is behind
      if (Math.abs(err) > 2.6) { if (!this.turnSign) this.turnSign = Math.sign(this.headYaw) || Math.sign(err) || 1; err = this.turnSign * Math.abs(err); }
      else this.turnSign = Math.abs(err) > 1.2 ? Math.sign(err) : 0;
      const wlim = Math.min(3.2 * g.agility, this.v / rmin);
      wTarget = clamp(err * 2.6, -wlim, wlim);
      this.w += (wTarget - this.w) * (1 - Math.exp(-dt * 7));
      this.w = clamp(this.w, -wlim, wlim);
    } else {
      this.w += (wTarget - this.w) * (1 - Math.exp(-dt * 5));
    }
    this.h += this.w * dt;
  }

  move(dt) {
    const w = this.world, L = this.L;
    const pulse = 1 + 0.08 * Math.cos(2 * this.phase);
    const stepLen = this.v * pulse * dt;
    this.x += Math.cos(this.h) * stepLen + (this.nudgeX || 0) * dt; this.y += Math.sin(this.h) * stepLen + (this.nudgeY || 0) * dt;
    this.x = clamp(this.x, -L * 0.7, w.W + L * 0.3); this.y = clamp(this.y, -L * 0.3, w.H + L * 0.3);
    this.dist += stepLen;
    let dph = (stepLen / (0.26 * L)) * TAU;
    const uph = ((this.phase % PI) + PI) % PI;
    if (dph < 1e-4 && uph > 0.001) dph = Math.min(3.5 * dt, PI - uph);   // a foot in the air always lands
    this.phase += dph;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(this.x - last.x, this.y - last.y) >= TS) this.trail.push({ x: this.x, y: this.y });
    const keep = Math.ceil((this.bodyL * 1.25) / TS) + 6;
    if (this.trail.length > keep) this.trail.splice(0, this.trail.length - keep);
  }

  // ---------------------------------------------------------------- spine
  gAt(f) {
    const S = this.S, x = clamp(f, 0, 1) * (M - 1), i = Math.min(M - 2, x | 0), k = x - i, a = S[i], b = S[i + 1];
    return {
      x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), tx: lerp(a.tx, b.tx, k), ty: lerp(a.ty, b.ty, k),
      nx: lerp(a.nx, b.nx, k), ny: lerp(a.ny, b.ny, k), hw: lerp(a.hw, b.hw, k)
    };
  }

  sampleTrail() {
    const { trail, C } = this, sp = this.bodyL / (N - 1);
    let idx = trail.length - 1, px = this.x, py = this.y, cum = 0, ex = -Math.cos(this.h), ey = -Math.sin(this.h);
    C[0].x = this.x; C[0].y = this.y;
    for (let i = 1; i < N; i++) {
      const s = i * sp;
      let done = false;
      while (idx >= 0) {
        const q = trail[idx], seg = Math.hypot(q.x - px, q.y - py);
        if (cum + seg >= s) {
          const r = seg > 1e-9 ? (s - cum) / seg : 0;
          C[i].x = px + (q.x - px) * r; C[i].y = py + (q.y - py) * r; done = true; break;
        }
        if (seg > 1e-9) { ex = (q.x - px) / seg; ey = (q.y - py) / seg; }
        cum += seg; px = q.x; py = q.y; idx--;
      }
      if (!done) { C[i].x = px + ex * (s - cum); C[i].y = py + ey * (s - cum); }
    }
  }

  frames() {
    const S = this.S;
    for (let j = 0; j < M; j++) {
      const a = S[Math.max(j - 1, 0)], b = S[Math.min(j + 1, M - 1)];
      let tx = a.x - b.x, ty = a.y - b.y; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
      const s = S[j]; s.tx = tx; s.ty = ty; s.nx = -ty; s.ny = tx;
    }
  }

  buildGeometry() {
    const { C, S, L, pose } = this, an = this.anatomy;
    const vc = 0.46 * L * this.genome.v.speed, vk = clamp(this.v / vc, 0, 1);
    this.sampleTrail();
    for (let pass = 0; pass < 2; pass++) {
      let px = C[0].x, py = C[0].y;
      for (let i = 1; i < N - 1; i++) {
        const cx = C[i].x, cy = C[i].y;
        C[i].x = 0.25 * px + 0.5 * cx + 0.25 * C[i + 1].x; C[i].y = 0.25 * py + 0.5 * cy + 0.25 * C[i + 1].y;
        px = cx; py = cy;
      }
    }
    let k = 0;
    for (let i = 0; i < N - 1; i++) {
      const p0 = C[Math.max(0, i - 1)], p1 = C[i], p2 = C[i + 1], p3 = C[Math.min(N - 1, i + 2)];
      for (let s = 0; s < SUB; s++, k++) {
        const t = s / SUB, t2 = t * t, t3 = t2 * t;
        S[k].x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        S[k].y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      }
    }
    S[k].x = C[N - 1].x; S[k].y = C[N - 1].y;
    this.frames();

    // gait-synchronised body wave, a lazy tail swish, and the tail's momentum when it turns
    const A = 0.036 * L * vk, idleA = (0.02 + 0.045 * pose.tail) * L * (1 - 0.7 * vk);
    const breathAmp = pose.breathAmp, breathF = 2.2 * pose.breathRate;
    const bob = 0.0045 * L * vk * Math.sin(2 * this.phase + 0.6);
    for (let j = 0; j < M; j++) {
      const s = S[j], t = j / (M - 1);
      s.t = t;
      const env = sstep(0, 0.28, t) * (0.18 + 0.82 * Math.pow(t, 1.1));
      let d = A * env * Math.sin(this.phase - t * TAU * 1.1);
      d += idleA * sstep(0.35, 1, t) * Math.sin(this.time * 1.1 - t * 3.4);
      d -= this.w * 0.011 * L * t * t * clamp(vk * 2, 0, 1);
      s.x += s.nx * d; s.y += s.ny * d;
      if (j < 8) { s.x += s.tx * bob * (1 - j / 8); s.y += s.ty * bob * (1 - j / 8); }
      const bump = sstep(0.08, 0.2, t) * (1 - sstep(0.42, 0.62, t));
      s.hw = an.halfWidth(t) * L * (1 + (0.028 * breathAmp * Math.sin(this.time * breathF) + 0.09 * this.breath) * bump);
    }
    this.frames();
  }

  // ---------------------------------------------------------------- head
  updateHead(cmd, dt) {
    const { S, L } = this, head = S[0], g = this.genome.v;
    const vc = 0.46 * L * g.speed;
    const neckDir = Math.atan2(head.ty, head.tx);
    this.lookOn = !!cmd.look;
    if (cmd.look) { this.look.x = cmd.look.x; this.look.y = cmd.look.y; }
    const yawMax = 0.95 * (1 - 0.35 * clamp(this.v / vc, 0, 1)) * (cmd.yawScale ?? 1);
    let yawT = this.lookOn ? clamp(angDiff(Math.atan2(this.look.y - head.y, this.look.x - head.x), neckDir), -yawMax, yawMax) : 0;
    yawT += this.pose.shake * 0.5 * Math.sin(this.time * 19) + this.pose.sniff * 0.42 * Math.sin(this.time * 3.3);
    if (cmd.headBias) yawT += cmd.headBias;
    const kq = 11;
    this.headYawV += (kq * kq * (yawT - this.headYaw) - 2 * kq * this.headYawV) * dt;
    this.headYaw += this.headYawV * dt;
    this.headAng = neckDir + this.headYaw;
    // blinking: slow and heavy-lidded when sleepy, not at all when asleep
    if (this.blinkT < 0 && this.time > this.nextBlink) this.blinkT = 0;
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT > 0.2) { this.blinkT = -1; this.nextBlink = this.time + rr(2.2, 6); } }
  }

  updatePose(cmd, dt) {
    const p = this.pose, k = (rate) => 1 - Math.exp(-dt * rate);
    p.jaw += ((cmd.jaw ?? 0) - p.jaw) * k(7);
    p.sniff += ((cmd.sniff ?? 0) - p.sniff) * k(5);
    p.eyeClose += ((cmd.eyeClose ?? 0) - p.eyeClose) * k(3.5);
    p.shake += ((cmd.shake ?? 0) - p.shake) * k(9);
    p.tail += ((cmd.tail ?? 0) - p.tail) * k(2.5);
    p.breathAmp += ((cmd.breathAmp ?? 1) - p.breathAmp) * k(2);
    p.breathRate += ((cmd.breathRate ?? 1) - p.breathRate) * k(2);
    p.flare += ((cmd.flare ?? 0) - p.flare) * k(4);
  }

  // ---------------------------------------------------------------- breath and wings
  updateBreath(cmd, dt) {
    const wantB = !!cmd.breath;
    this.breath += ((wantB ? 1 : 0) - this.breath) * (1 - Math.exp(-dt * (wantB ? 7 : 4)));
  }

  updateWings(cmd, dt) {
    const wingT = this.breath > 0.15 ? 0.95 : (cmd.wing ?? 0.07);
    this.wing += (wingT - this.wing) * (1 - Math.exp(-dt * (wingT > this.wing ? 5 : 3)));
    this.wphase += dt * (1.6 + 4.4 * this.wing);
    this.flap = this.breath > 0.15 ? 0.16 : (cmd.flap ?? (wingT > 0.5 ? 0.08 : 0.03));
  }

  // ---------------------------------------------------------------- legs
  /**
   * Gait, learned from the salamander engine: no per-foot timers. One gait phase advances with distance walked.
   * In the first half of each cycle one diagonal pair swings while the other is planted, then they trade. A planted
   * foot never moves. The swing target is the neutral foothold plus a lead proportional to speed, tracking the body
   * live, so the stride always matches the motion. Front elbows point back, hind knees forward.
   */
  updateLegs(dt) {
    const L = this.L, an = this.anatomy, kv = clamp(this.v / (0.46 * L * this.genome.v.speed) * 1.6, 0, 1);
    const ph = ((this.phase % TAU) + TAU) % TAU;
    for (const l of this.legs) {
      const c = l.front ? an.leg.front : an.leg.hind;
      const g = this.gAt(l.frac);
      l.A = L * c.a; l.B = L * c.b;
      l.ax = g.x + g.nx * l.side * g.hw * 0.62; l.ay = g.y + g.ny * l.side * g.hw * 0.62;
      l.px = g.x + g.nx * l.side * L * c.lat + g.tx * L * c.fw;          // neutral foothold
      l.py = g.y + g.ny * l.side * L * c.lat + g.ty * L * c.fw;
      l.tx = g.tx; l.ty = g.ty; l.nx = g.nx; l.ny = g.ny;
      if (!l.fx) { l.fx = l.px; l.fy = l.py; }
      if (dt <= 0) { l.sw = null; l.lift = 0; l.fx = l.px; l.fy = l.py; this.solveLeg(l); continue; }
      const first = l.pair === 0;
      const swinging = first ? ph < PI : ph >= PI;
      const x = first ? ph / PI : (ph - PI) / PI;
      if (swinging) {
        if (!l.sw) { l.sw = { x0: l.fx, y0: l.fy }; this.steps++; }
        const lead = L * 0.055 * kv;
        const tgx = l.px + g.tx * lead, tgy = l.py + g.ty * lead, e = x * x * (3 - 2 * x);
        l.fx = lerp(l.sw.x0, tgx, e); l.fy = lerp(l.sw.y0, tgy, e);
        l.lift = Math.sin(PI * clamp(x, 0, 1));
        l.stance = 0; l.curl = 0.12 + 0.62 * l.lift; l.spread = 1 - 0.2 * l.lift;
      } else {
        l.sw = null; l.lift = 0;
        if (Math.hypot(l.fx - l.px, l.fy - l.py) > L * 0.24) { l.fx = l.px; l.fy = l.py; }
        const u = first ? (ph - PI) / PI : ph / PI;                   // how far through the planted half we are
        l.stance = u;
        l.curl = 0.5 * sstep(0.72, 1, u) * kv;                        // toes peel as the foot is about to leave the ground
        l.spread = 1 + 0.24 * (1 - sstep(0, 0.3, u));                 // and fan wide as the weight comes on
      }
      this.solveLeg(l);
    }
  }

  solveLeg(l) {
    const A = l.A, B = l.B;
    const dx = l.fx - l.ax, dy = l.fy - l.ay, d0 = Math.hypot(dx, dy) || 1;
    const d = clamp(d0, Math.abs(A - B) + 1, (A + B) * 0.995), ux = dx / d0, uy = dy / d0;
    const x = (A * A - B * B + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A * A - x * x));
    const k1x = l.ax + ux * x - uy * h, k1y = l.ay + uy * x + ux * h;
    const k2x = l.ax + ux * x + uy * h, k2y = l.ay + uy * x - ux * h;
    const f1 = (k1x - l.ax) * l.tx + (k1y - l.ay) * l.ty, f2 = (k2x - l.ax) * l.tx + (k2y - l.ay) * l.ty;
    const pickFirst = l.front ? f1 < f2 : f1 > f2;
    if (pickFirst) { l.kx = k1x; l.ky = k1y; } else { l.kx = k2x; l.ky = k2y; }
    l.ex = l.ax + ux * d; l.ey = l.ay + uy * d;
  }

  // ---------------------------------------------------------------- wings
  /** Finger bones, wrist, shoulder and trailing base for one side, at the current openness. */
  wingGeom(side) {
    const L = this.L, an = this.anatomy, wc = an.wing;
    const sg = this.gAt(wc.shoulderT), bg = this.gAt(wc.baseT);
    const o = clamp(this.wing + side * clamp(this.w * 0.05, -0.07, 0.07), 0, 1);
    const so = lerp(0.68, 0.5, o), bo = lerp(0.62, 0.88, o);
    const Sx = sg.x + sg.nx * side * sg.hw * so, Sy = sg.y + sg.ny * side * sg.hw * so;
    const Bx = bg.x + bg.nx * side * bg.hw * bo, By = bg.y + bg.ny * side * bg.hw * bo;
    const fx = sg.tx, fy = sg.ty, nx = sg.nx * side, ny = sg.ny * side;
    const ph = this.wphase + (side > 0 ? 0.35 : 0), fl = Math.sin(ph) * this.flap;
    // seen from above a beating wing shortens as it rises and falls, and is longest at mid-stroke
    const shorten = 1 - 0.2 * clamp(this.flap / 0.16, 0, 1) * Math.pow(Math.sin(ph), 2) * o;
    // the idle wing is never quite still: a slow breathing and a tremor at the tips
    const idle = (1 - clamp(this.flap / 0.08, 0, 1)) * 0.5;
    const dir = th => [fx * Math.cos(th) + nx * Math.sin(th), fy * Math.cos(th) + ny * Math.sin(th)];
    const armTh = lerp(3.02, 1.15, o) + fl * 0.5, armL = L * wc.armLen * lerp(0.5, 1, o) * (1 - 0.5 * (1 - shorten));
    const ad = dir(armTh), Wx = Sx + ad[0] * armL, Wy = Sy + ad[1] * armL;
    const tips = [], ctr = [], joints = [];
    for (let i = 0; i < wc.fingers; i++) {
      const e = sstep(0.03 * i, 0.78 + 0.03 * i, o);
      const lag = Math.sin(ph - 0.34 * (i + 1)) * this.flap * (0.35 + 0.2 * i) + idle * 0.02 * Math.sin(this.time * 1.3 + i * 1.7 + side) * (i + 1) * o;
      const th = lerp(wc.fold[i], wc.open[i], e) + lag, len = wc.lens[i] * L * lerp(0.46, 1, e) * shorten;
      const dd = dir(th), tx = Wx + dd[0] * len, ty = Wy + dd[1] * len;
      const bow = 0.1 * len * (0.3 + 0.7 * e);
      tips.push([tx, ty]);
      ctr.push([(Wx + tx) / 2 + fx * bow, (Wy + ty) / 2 + fy * bow]);
      // the finger has a knuckle: a point a little past halfway, pulled along the bow
      joints.push([lerp(Wx, tx, 0.56) + fx * bow * 1.6, lerp(Wy, ty, 0.56) + fy * bow * 1.6]);
    }
    return { S: [Sx, Sy], W: [Wx, Wy], B: [Bx, By], tips, ctr, joints, o, f: [fx, fy], n: [nx, ny], armTh, dir, side };
  }
  updateWingGeom() { this.wg[0] = this.wingGeom(-1); this.wg[1] = this.wingGeom(1); }

  // ---------------------------------------------------------------- fire and smoke
  updateEmission(dt) {
    const { S, L } = this, head = S[0], hd = this.headAng, p = this.world.particles, an = this.anatomy;
    const lift = this.pose.sniff * 0.0;
    const hx = head.x, hy = head.y;
    const mx = hx + Math.cos(hd) * L * 0.125 * an.head.snout, my = hy + Math.sin(hd) * L * 0.125 * an.head.snout;
    this.mouth.x = mx; this.mouth.y = my;
    const hue = an.fire.hue, u = L / 30;
    if (this.breath > 0.3) {
      // a narrow, fast core that billows as it travels (see Particles): few, large, soft particles
      this.emit += dt * 100 * this.breath * an.fire.rate;
      while (this.emit >= 1) {
        this.emit -= 1;
        const a = hd + (Math.random() + Math.random() - 1) * 0.045, spd = rr(1.0, 1.32) * L * an.fire.reach;
        const off = rr(-0.012, 0.012) * L;
        p.fire(mx - Math.sin(hd) * off, my + Math.cos(hd) * off, Math.cos(a) * spd, Math.sin(a) * spd, rr(0.42, 0.6), rr(0.012, 0.019) * L, hue, u);
      }
      this.sparkAcc += dt * 7 * this.breath * an.fire.rate;
      while (this.sparkAcc >= 1) {
        this.sparkAcc -= 1;
        const a = hd + rr(-0.3, 0.3), spd = rr(40, 90) * u * an.fire.reach;
        p.spark(mx, my, Math.cos(a) * spd, Math.sin(a) * spd, rr(0.4, 0.8), hue, u);
      }
    }
    // nostril smoke: a lazy curl now and then, quicker when sniffing, slow and warm when asleep
    if (this.breath < 0.2 && this.time > this.nextPuff) {
      this.nextPuff = this.time + rr(1.2, 2.8) / (1 + 2.2 * this.pose.sniff) * (this.pose.eyeClose > 0.7 ? 2.2 : 1);
      for (const s of [-1, 1]) p.smoke(mx - Math.cos(hd) * L * 0.012 - Math.sin(hd) * s * L * 0.007, my - Math.sin(hd) * L * 0.012 + Math.cos(hd) * s * L * 0.007,
        Math.cos(hd) * 14 + rr(-6, 6), Math.sin(hd) * 14 - 8 + rr(-6, 6), rr(1.0, 1.7), rr(0.3, 0.55) * u);
    }
  }

  // ---------------------------------------------------------------- what the text has to avoid
  /** Circles the page must flow around: body, head with horns and frills, and the limbs. */
  collectObstacles(out) {
    const { S, L } = this, head = S[0], hd = this.headAng, an = this.anatomy;
    for (let j = 0; j < M; j += 2) { const g = S[j]; out.push({ x: g.x, y: g.y, r: g.hw * 1.06 }); }
    { const g = S[M - 1]; out.push({ x: g.x, y: g.y, r: Math.max(g.hw, 3) }); }
    const hc = Math.cos(hd), hs = Math.sin(hd), hx = head.x, hy = head.y, hz = an.head.size, sn = an.head.snout;
    out.push({ x: hx + hc * L * 0.03, y: hy + hs * L * 0.03, r: L * 0.062 * hz });
    out.push({ x: hx + hc * L * 0.1 * sn, y: hy + hs * L * 0.1 * sn, r: L * 0.034 * hz });
    const hornR = Math.max(an.head.horns, an.head.frill * 0.8);
    for (const sd of [-1, 1]) {
      out.push({ x: hx - hc * L * 0.05 - hs * sd * L * 0.06, y: hy - hs * L * 0.05 + hc * sd * L * 0.06, r: L * (0.025 + 0.015 * hornR) * hz });
      out.push({ x: hx - hc * L * 0.01 - hs * sd * L * 0.085, y: hy - hs * L * 0.01 + hc * sd * L * 0.085, r: L * 0.026 * hz });
    }
    for (const l of this.legs) {
      out.push({ x: l.ex, y: l.ey, r: L * 0.034 });
      out.push({ x: l.kx, y: l.ky, r: L * 0.026 });
      out.push({ x: (l.kx + l.ex) / 2, y: (l.ky + l.ey) / 2, r: L * 0.022 });
      out.push({ x: (l.kx + l.ax) / 2, y: (l.ky + l.ay) / 2, r: L * 0.026 });
    }
  }

  /** The point just behind the tail tip, used when it chases its tail. */
  get tail() { const s = this.S[M - 1]; return { x: s.x, y: s.y }; }
  get headPos() { const s = this.S[0]; return { x: s.x, y: s.y }; }
}
