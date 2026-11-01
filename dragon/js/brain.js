// A Brain decides what its Dragon wants. Every frame it returns a command object; the Dragon turns the command
// into motion. Behaviours are small classes with the same interface, so adding a new one is: subclass, give it a
// weight, register it in ACTIONS.
//
//   locomotion layer   Follow (the pointer) | Flock (stay with the leader) | Wander (pick places to go)
//   action layer       one ambient Action at a time (glance, sniff, stretch, yawn, shake, read, burn, sleep, ...)
//
// Needs: energy drains while walking and refills in sleep; boredom grows while nothing is happening and makes
// the dragon do something silly. The genome's temperament scales how readily each behaviour is chosen.

import { PI, clamp, lerp, sstep, angDiff, rr } from './util.js';
import { M } from './anatomy.js';

const rnd = Math.random;

// ------------------------------------------------------------------ actions
class Action {
  constructor(brain) { this.brain = brain; this.dragon = brain.dragon; this.t = 0; }
  weight() { return 0; }
  start() { this.t = 0; }
  tick() { return false; }       // return true while still running
  get L() { return this.dragon.L; }
}

class Glance extends Action {
  weight(c) { return 1 + 2 * c.g.curiosity; }
  start() { this.t = 0; this.dur = rr(1.6, 3); this.n = 0; this.pick(); }
  pick() {
    const d = this.dragon, a = d.headAng + rr(-1.1, 1.1) + (rnd() < 0.5 ? 0 : PI * 0.4 * (rnd() < 0.5 ? -1 : 1));
    this.pt = { x: d.x + Math.cos(a) * this.L * 1.2, y: d.y + Math.sin(a) * this.L * 1.2 }; this.next = this.t + rr(0.5, 1);
  }
  tick(dt, cmd) {
    this.t += dt; if (this.t > this.next) this.pick();
    cmd.mode = 'hold'; cmd.look = this.pt; cmd.tail = 0.3; cmd.yawScale = 1.15;
    return this.t < this.dur;
  }
}

class Sniff extends Action {
  weight(c) { return 0.6 + 2.2 * c.g.curiosity; }
  start() { this.t = 0; this.dur = rr(2.2, 3.4); const d = this.dragon, w = this.brain.world.page?.randomWord(d.x, d.y, 0.1 * this.L, 0.7 * this.L); this.pt = w || { x: d.x + Math.cos(d.headAng) * this.L * 0.4, y: d.y + Math.sin(d.headAng) * this.L * 0.4 }; }
  tick(dt, cmd) {
    this.t += dt; cmd.mode = 'hold'; cmd.sniff = sstep(0, 0.4, this.t) * (1 - sstep(this.dur - 0.5, this.dur, this.t));
    cmd.look = this.pt; cmd.breathRate = 2.2; cmd.speed = 0;
    return this.t < this.dur;
  }
}

class Stretch extends Action {
  weight(c) { return 1.1 + 0.8 * (1 - c.energy); }
  start() { this.t = 0; this.dur = rr(3.2, 4.4); }
  tick(dt, cmd) {
    this.t += dt; const k = sstep(0, 0.7, this.t) * (1 - sstep(this.dur - 0.9, this.dur, this.t));
    cmd.mode = 'hold'; cmd.wing = 0.2 + 0.8 * k; cmd.flap = 0.01; cmd.breathAmp = 1 + 1.4 * k; cmd.breathRate = 0.7;
    cmd.jaw = 0.25 * k; cmd.eyeClose = 0.5 * k; cmd.tail = 0.5; cmd.flare = k;
    return this.t < this.dur;
  }
}

class Yawn extends Action {
  weight(c) { return 0.3 + 2.2 * c.g.laziness + 1.3 * (1 - c.energy); }
  start() { this.t = 0; this.dur = 2.8; this.puffed = false; }
  tick(dt, cmd) {
    this.t += dt; const u = this.t / this.dur, bell = Math.sin(clamp(u, 0, 1) * PI);
    cmd.mode = 'hold'; cmd.jaw = Math.pow(bell, 0.6); cmd.eyeClose = Math.pow(bell, 0.5); cmd.breathAmp = 1 + 1.2 * bell; cmd.breathRate = 0.55;
    cmd.look = null; cmd.headBias = -0.18 * bell; cmd.wing = 0.07 + 0.25 * bell; cmd.speed = 0;
    if (!this.puffed && u > 0.7) { this.puffed = true; const d = this.dragon; for (let i = 0; i < 4; i++) this.brain.world.particles.smoke(d.mouth.x, d.mouth.y, Math.cos(d.headAng) * 18 + rr(-8, 8), Math.sin(d.headAng) * 18 - 6 + rr(-8, 8), rr(1.2, 2), rr(0.4, 0.7) * d.L / 30); }
    return this.t < this.dur;
  }
}

class Shake extends Action {
  weight(c) { return 0.35 + 0.5 * c.g.curiosity; }
  start() { this.t = 0; this.dur = 1.5; }
  tick(dt, cmd) {
    this.t += dt; const k = Math.sin(clamp(this.t / this.dur, 0, 1) * PI);
    cmd.mode = 'hold'; cmd.shake = k; cmd.wing = 0.2 + 0.25 * k; cmd.flap = 0.05; cmd.tail = 0.7; cmd.speed = 0;
    return this.t < this.dur;
  }
}

class TailSwish extends Action {
  weight() { return 1; }
  start() { this.t = 0; this.dur = rr(2.4, 4); }
  tick(dt, cmd) {
    this.t += dt; cmd.tail = 1; cmd.speed = 0.4; cmd.mode = 'go'; return this.t < this.dur;
  }
}

/** Walk up to a word, stop a respectful distance away and read it. */
class ReadWord extends Action {
  weight(c) { return 0.5 + 2.2 * c.g.curiosity; }
  start() {
    this.t = 0; this.phase = 0; this.dur = rr(2, 3.4);
    const d = this.dragon; this.w = this.brain.world.page?.randomWord(d.x, d.y, 0.5 * this.L, 1.6 * this.L);
    if (!this.w) this.dur = 0;
  }
  tick(dt, cmd) {
    if (!this.w) return false;
    const d = this.dragon, dist = Math.hypot(this.w.x - d.x, this.w.y - d.y);
    cmd.look = this.w;
    if (this.phase === 0) {
      cmd.mode = 'go'; cmd.tx = this.w.x; cmd.ty = this.w.y; cmd.stand = 0.3 * this.L; cmd.speed = 0.85;
      this.t += dt; if (dist < 0.4 * this.L || this.t > 6) { this.phase = 1; this.t = 0; }
      return true;
    }
    this.t += dt; cmd.mode = 'hold'; cmd.sniff = 0.5; cmd.breathRate = 1.4; cmd.speed = 0;
    return this.t < this.dur;
  }
}

/** Pyromania: pick a word and set it on fire. */
class BurnWord extends Action {
  weight(c) { return 2.4 * c.g.pyro; }
  start() {
    this.t = 0; this.phase = 0; this.dur = rr(1.0, 1.8);
    const d = this.dragon; this.w = this.brain.world.page?.randomWord(d.x, d.y, 0.5 * this.L, 1.8 * this.L, true);
    if (!this.w) this.dur = 0;
  }
  tick(dt, cmd) {
    if (!this.w) return false;
    const d = this.dragon, dx = this.w.x - d.x, dy = this.w.y - d.y, dist = Math.hypot(dx, dy);
    cmd.look = this.w; this.t += dt;
    if (this.phase === 0) {
      cmd.mode = 'go'; cmd.tx = this.w.x; cmd.ty = this.w.y; cmd.stand = 0.34 * this.L * d.anatomy.fire.reach; cmd.speed = 0.9;
      const aligned = Math.abs(angDiff(Math.atan2(dy, dx), d.headAng)) < 0.35;
      if ((dist < 0.5 * this.L * d.anatomy.fire.reach && aligned) || this.t > 7) { this.phase = 1; this.t = 0; }
      return true;
    }
    cmd.mode = 'hold'; cmd.breath = this.t > 0.25 && this.t < this.dur; cmd.wing = 0.5; cmd.speed = 0;
    return this.t < this.dur + 0.5;
  }
}

/** Walk in a tightening circle, curl up and doze. Wakes if the pointer comes near or presses. */
class Sleep extends Action {
  weight(c) { return c.energy < 0.3 + 0.3 * c.g.laziness ? 5 * (1.3 - c.energy) : 0; }
  start() {
    this.t = 0; this.phase = 'seek'; this.dir = rnd() < 0.5 ? -1 : 1; this.dur = rr(10, 22) * (0.6 + c0(this.brain.dragon.genome.v.laziness));
    const w = this.brain.world, d = this.dragon, m = this.L * 0.55;
    let best = null, bs = -1;
    for (let i = 0; i < 10; i++) {
      const x = i ? rr(m, w.W - m) : clamp(d.x + Math.cos(d.h) * this.L * 0.7, m, w.W - m), y = i ? rr(m, w.H - m) : clamp(d.y + Math.sin(d.h) * this.L * 0.7, m, w.H - m);
      let clear = 1e9; for (const o of w.dragons) if (o !== d) for (let j = 0; j < M; j += 6) clear = Math.min(clear, Math.hypot(o.S[j].x - x, o.S[j].y - y));
      const s = Math.min(clear, 1.2 * this.L) - 0.2 * Math.hypot(x - d.x, y - d.y);
      if (s > bs) { bs = s; best = { x, y }; }
    }
    this.spot = best;
    this.r = 0.38; this.rest = 0; this.brain.world.pointer.moveSince = 0;
  }
  tick(dt, cmd, ctx) {
    const d = this.dragon, len = d.genome.v.length, rEnd = 0.185 * len;
    this.t += dt;
    if (this.phase === 'seek') {
      cmd.mode = 'go'; cmd.tx = this.spot.x; cmd.ty = this.spot.y; cmd.stand = 0.05 * this.L; cmd.speed = 0.7; cmd.eyeClose = 0.3 * sstep(0, 3, this.t); cmd.breathRate = 0.8;
      if (Math.hypot(this.spot.x - d.x, this.spot.y - d.y) < 0.15 * this.L || this.t > 8) { this.phase = 'curl'; this.t = 0; }
      return true;
    }
    if (this.phase === 'curl') {
      // spiral inwards until the body wraps around itself
      this.r = lerp(0.38 * len, rEnd, sstep(0, 6.5, this.t));
      cmd.mode = 'curl'; cmd.curl = { dir: this.dir, r: this.r, speed: lerp(0.75, 0.4, sstep(0, 6.5, this.t)) };
      cmd.eyeClose = 0.3 + 0.6 * sstep(0, 6.5, this.t); cmd.breathRate = 0.7; cmd.breathAmp = 1.3; cmd.tail = 0;
      if (this.t > 7.4) { this.phase = 'rest'; this.t = 0; }
      return true;
    }
    // rest: breathe slowly, eyes shut, little smoke curls. Wake on disturbance or when rested.
    cmd.mode = 'hold'; cmd.eyeClose = 1; cmd.breathRate = 0.42; cmd.breathAmp = 1.9; cmd.tail = 0; cmd.speed = 0; cmd.look = null; cmd.wing = 0.04; cmd.flap = 0;
    const p = ctx.pointer;
    const disturbed = p.down || (p.moveSince > 70 && Math.hypot(p.x - d.x, p.y - d.y) < 3 * this.L) || p.moveSince > 420;
    this.rest += dt;
    if (disturbed && this.rest > 1) { this.brain.startled = 1; this.brain.energy = Math.max(this.brain.energy, 0.3); return false; }
    this.brain.energy = Math.min(1, this.brain.energy + dt / 28);
    return this.rest < this.dur && this.brain.energy < 0.98 || this.rest < 5;
  }
  stop() { this.brain.queue = 'yawn'; }
}
const c0 = x => x;

class TailChase extends Action {
  weight(c) { return c.boredom * 2.6 * (0.3 + c.g.curiosity) * (c.energy > 0.35 ? 1 : 0); }
  start() { this.t = 0; this.dir = rnd() < 0.5 ? -1 : 1; this.dur = rr(4.5, 7); }
  tick(dt, cmd) {
    this.t += dt; const len = this.dragon.genome.v.length;
    cmd.mode = 'curl'; cmd.curl = { dir: this.dir, r: 0.2 * len, speed: 0.55 + 0.3 * sstep(0, 1.5, this.t) };
    cmd.look = this.dragon.tail; cmd.wing = 0.35; cmd.flap = 0.05; cmd.yawScale = 1.3;
    this.brain.boredom = Math.max(0, this.brain.boredom - dt * 0.2);
    return this.t < this.dur;
  }
}

/** Notice a neighbour: stop, look, sniff, a puff of smoke. */
class Greet extends Action {
  weight(c) { return c.nearest && c.nearest.d < 1.5 * this.L && !c.nearest.dragon.brain.asleep ? 4 * c.g.sociability : 0; }
  start() { this.t = 0; this.dur = rr(2, 3.4); this.other = this.brain.ctx.nearest?.dragon; this.puffed = false; }
  tick(dt, cmd) {
    this.t += dt;
    if (!this.other) return false;
    const o = this.other.headPos, d = this.dragon;
    cmd.mode = 'hold'; cmd.look = o; cmd.sniff = 0.7 * sstep(0, 0.5, this.t); cmd.tail = 0.6; cmd.wing = 0.12 + 0.15 * Math.sin(this.t * 2); cmd.speed = 0;
    if (!this.puffed && this.t > 0.7) { this.puffed = true; this.brain.world.particles.smoke(d.mouth.x, d.mouth.y, rr(-8, 8), -10, 1.4, d.L / 60); }
    return this.t < this.dur;
  }
}

/** Wander over to a burnt hole in the page, look into it, sniff, and look pleased (or guilty). */
class InspectHole extends Action {
  weight(c) { const pp = this.brain.world.paper; return pp && this.brain.world.paperOn && pp.stats.holes > 20 ? 0.8 + 2 * c.g.curiosity : 0; }
  start() {
    this.t = 0; this.phase = 0; this.dur = rr(2.2, 3.4);
    const d = this.dragon; this.pt = this.brain.world.paper.randomHole(d.x, d.y, 0.4 * this.L, 2.4 * this.L); if (!this.pt) this.dur = 0;
  }
  tick(dt, cmd) {
    if (!this.pt) return false;
    const d = this.dragon, dist = Math.hypot(this.pt.x - d.x, this.pt.y - d.y); this.t += dt; cmd.look = this.pt;
    if (this.phase === 0) {
      cmd.mode = 'go'; cmd.tx = this.pt.x; cmd.ty = this.pt.y; cmd.stand = 0.26 * this.L; cmd.speed = 0.6; cmd.tail = 0.2;
      if (dist < 0.38 * this.L || this.t > 7) { this.phase = 1; this.t = 0; }
      return true;
    }
    cmd.mode = 'hold'; cmd.sniff = sstep(0, 0.5, this.t); cmd.headBias = 0.12 * Math.sin(this.t * 1.6); cmd.breathRate = 1.8; cmd.speed = 0; cmd.tail = 0.4;
    return this.t < this.dur;
  }
}

/** Stalk a moth: creep up, pounce with a snap, and sometimes finish it with a puff of fire. */
class Hunt extends Action {
  weight(c) { const m = this.brain.world.moths; return m && m.list.length ? 0.9 + 2.2 * c.g.curiosity : 0; }
  start() {
    this.t = 0; this.phase = 0; this.puff = false; this.fire = this.brain.ctx.g.pyro > 0.45 && rnd() < 0.55;
    const d = this.dragon, n = this.brain.world.moths.nearest(d.x, d.y); this.moth = n && n.d < 2.6 * this.L ? n.moth : null;
  }
  tick(dt, cmd) {
    const m = this.moth; if (!m || m.burn >= 0 || !this.brain.world.moths.list.includes(m)) return false;
    const d = this.dragon, dx = m.x - d.x, dy = m.y - d.y, dist = Math.hypot(dx, dy); this.t += dt; cmd.look = m; cmd.tail = 0.5;
    if (this.phase === 0) {
      cmd.mode = 'go'; cmd.tx = m.x; cmd.ty = m.y; cmd.stand = 0.2 * this.L; cmd.speed = dist > 0.8 * this.L ? 0.9 : 0.45; cmd.sniff = 0.3;
      if (dist < 0.4 * this.L * (this.fire ? 1.4 : 1) || this.t > 7) { this.phase = 1; this.t = 0; }
      return true;
    }
    cmd.mode = 'hold'; cmd.speed = 0;
    if (this.fire) { cmd.breath = this.t > 0.2 && this.t < 0.9; cmd.wing = 0.5; return this.t < 1.3; }
    cmd.jaw = Math.sin(clamp(this.t / 0.5, 0, 1) * PI * 2) > 0 ? 0.9 : 0.1; cmd.headBias = 0.1;     // snap, snap
    if (!this.puff && this.t > 0.15) { this.puff = true; m.rest = 0; m.a += rr(-1, 1) + PI * 0.5; m.v = 90; }
    return this.t < 1.1;
  }
}

export const ACTIONS = { hunt: Hunt, inspect: InspectHole, glance: Glance, sniff: Sniff, stretch: Stretch, yawn: Yawn, shake: Shake, tail: TailSwish, read: ReadWord, burn: BurnWord, sleep: Sleep, chase: TailChase, greet: Greet };

// ------------------------------------------------------------------ brain
export class Brain {
  constructor(dragon) {
    this.dragon = dragon; this.world = dragon.world;
    this.energy = 0.55 + 0.45 * rnd(); this.boredom = 0;
    this.action = null; this.actionName = ''; this.nextAction = 2 + rnd() * 3; this.queue = null; this.clock = 0;
    this.wp = null; this.wpWait = 0; this.glanceUntil = 0; this.glanceAt = 3 + rnd() * 3; this.glanceTarget = null;
    this.fireHold = 0; this.startled = 0; this.mimic = false; this.prevDown = false; this.ctx = null; this.asleep = false;
    this.actions = {}; for (const k in ACTIONS) this.actions[k] = new ACTIONS[k](this);
    this.dir = { x: 1, y: 0 }; this.entering = false;
  }

  /** Walk in from off-screen towards a first waypoint. */
  enter(wp) { this.entering = true; this.wp = wp; this.wpWait = 0; }

  get sleeping() { return this.action === this.actions.sleep; }

  /** Everything the brain gets to know about the world. */
  sense() {
    const w = this.world, d = this.dragon, p = w.pointer;
    let nearest = null;
    for (const o of w.dragons) {
      if (o === d) continue;
      const dd = Math.hypot(o.x - d.x, o.y - d.y);
      if (!nearest || dd < nearest.d) nearest = { dragon: o, d: dd };
    }
    return { g: d.genome.v, pointer: p, energy: this.energy, boredom: this.boredom, nearest, leader: w.leader, isLeader: w.leader === d, L: d.L };
  }

  blank() {
    return { mode: 'go', tx: this.dragon.x, ty: this.dragon.y, stand: undefined, speed: 1, look: null, breath: false, wing: 0.07, flap: undefined,
      jaw: 0, sniff: 0, eyeClose: 0, shake: 0, tail: 0, breathAmp: 1, breathRate: 1, flare: 0, yawScale: 1, headBias: 0 };
  }

  setAction(name) {
    if (this.action) this.action.stop?.();
    this.action = name ? this.actions[name] : null; this.actionName = name || '';
    if (this.action) this.action.start();
    this.asleep = name === 'sleep';
  }

  update(dt) {
    this.clock += dt;
    const ctx = this.ctx = this.sense(), d = this.dragon, p = ctx.pointer, g = ctx.g, cmd = this.blank();
    const speedNow = d.v / (0.46 * d.L * g.speed);

    // needs
    if (!this.sleeping) this.energy = clamp(this.energy - dt * (0.004 + 0.008 * speedNow) * (0.6 + g.laziness), 0, 1);
    const idle = p.idleFor;
    if (!this.action && idle > 6) this.boredom = clamp(this.boredom + dt * 0.02 * (0.4 + g.curiosity), 0, 1);
    else if (idle < 2) this.boredom = Math.max(0, this.boredom - dt * 0.15);

    const userDriven = ctx.isLeader && p.seen && idle < 8;

    // a user takes over from any interruptible action (but not from a deep sleep, which wakes first)
    if (userDriven && this.action && !this.sleeping) this.setAction(null);
    if (userDriven && this.sleeping && (p.down || p.moveSince > 70)) this.setAction(null);

    // run the current action
    let acted = false;
    if (this.action) {
      if (this.action.tick(dt, cmd, ctx)) acted = true;
      else { const was = this.actionName; this.setAction(null); if (was === 'sleep' && this.startled) { this.queue = 'shake'; } this.nextAction = this.clock + rr(2, 6) * (1.4 - g.curiosity * 0.6); }
    }
    if (!this.action && this.queue) { const q = this.queue; this.queue = null; this.setAction(q); if (this.action.tick(dt, cmd, ctx)) acted = true; }

    if (!acted) {
      // choose a locomotion layer
      if (userDriven) this.follow(dt, cmd, ctx);
      else if (!ctx.isLeader && ctx.leader && this.social(ctx)) this.flock(dt, cmd, ctx);
      else this.wander(dt, cmd, ctx);
      // maybe start an ambient action
      if (!userDriven && this.clock > this.nextAction) this.chooseAction(ctx);
    }

    if (this.entering) { if (d.x < this.world.W * 0.12) cmd.minSpeed = Math.max(cmd.minSpeed || 0, 0.55); else this.entering = false; }
    if (cmd.mode === 'go') this.avoid(cmd, ctx);
    // fire: held or tapped by the user, or mimicked by a flock-mate
    this.fireControl(dt, cmd, ctx, userDriven);
    if (this.world.safeFlock) cmd.breath = cmd.breath && ctx.isLeader;
    this.prevDown = p.down;
    return cmd;
  }

  social(ctx) {
    // sleepers and anti-socials do their own thing
    return ctx.g.sociability > 0.15 && this.world.flocking;
  }

  // ---------------------------------------------------------------- picking an ambient action
  chooseAction(ctx) {
    const options = [];
    for (const k in this.actions) {
      const w = this.actions[k].weight(ctx);
      if (w > 0) options.push([k, w]);
    }
    // sleepiness spreads
    const near = ctx.nearest;
    if (near && near.dragon.brain.asleep && near.d < 2.5 * ctx.L && ctx.energy < 0.7) options.push(['sleep', 3]);
    let sum = 0; for (const o of options) sum += o[1];
    this.nextAction = this.clock + rr(2.5, 7) * (1.3 - 0.6 * ctx.g.curiosity);
    if (!sum || rnd() < 0.18) return;
    let r = rnd() * sum;
    for (const [k, w] of options) { r -= w; if (r <= 0) { this.setAction(k); return; } }
  }

  // ---------------------------------------------------------------- locomotion layers
  follow(dt, cmd, ctx) {
    const p = ctx.pointer, d = this.dragon;
    cmd.mode = 'go'; cmd.tx = p.x; cmd.ty = p.y; cmd.stand = 0.26 * d.L; cmd.look = p; cmd.speed = 1;
    cmd.wing = 0.07; cmd.tail = 0.1;
  }

  wander(dt, cmd, ctx) {
    const d = this.dragon, w = this.world, L = d.L, g = ctx.g;
    const m = Math.min(0.55 * L, Math.min(w.W, w.H) * 0.25);
    if (!this.wp || this.wpWait > 0) {
      if (this.wp && this.wpWait > 0) {
        this.wpWait -= dt;
        // pausing: stand, breathe, look about
        cmd.mode = 'hold'; cmd.tail = 0.25;
        // the leader does not set off until the flock has caught up
        if (ctx.isLeader && w.flocking && this.stragglers() > 0.5) this.wpWait = Math.max(this.wpWait, 0.2);
        if (this.wpWait <= 0) this.wp = null;
        this.glance(dt, cmd, ctx);
        return;
      }
      this.wp = this.pickWaypoint(m);
    }
    cmd.mode = 'go'; cmd.tx = this.wp.x; cmd.ty = this.wp.y; cmd.stand = 0.12 * L;
    // an unhurried, slightly varying stroll, slower if the flock has fallen behind
    const stray = ctx.isLeader && w.flocking ? this.stragglers() : 0;
    cmd.speed = clamp((0.55 + 0.35 * (1 - g.laziness) + 0.1 * ctx.energy) * (0.9 + 0.2 * Math.sin(this.clock * 0.37 + d.id)) * (1 - 0.6 * stray), 0.15, 1);
    cmd.minSpeed = 0.08;
    this.avoidOthers(cmd, ctx);
    this.glance(dt, cmd, ctx);
    if (Math.hypot(this.wp.x - d.x, this.wp.y - d.y) < 0.2 * L) { this.wpWait = rr(0.4, 2.2) * (0.5 + g.laziness); }
  }

  /** 0..1: how far the furthest flock-mate has fallen behind the leader (only meaningful for the leader). */
  stragglers() {
    const d = this.dragon, w = this.world; let m = 0;
    for (const o of w.dragons) if (o !== d && o.brain.social(o.brain.ctx || {g: o.genome.v})) m = Math.max(m, Math.hypot(o.x - d.x, o.y - d.y));
    return sstep(1.6 * d.L, 3.2 * d.L, m);
  }

  /** Occasional look to the side while walking. */
  glance(dt, cmd, ctx) {
    const d = this.dragon;
    if (this.clock > this.glanceAt && this.clock > this.glanceUntil) {
      const o = ctx.nearest && ctx.nearest.d < 3 * d.L && rnd() < 0.5 ? ctx.nearest.dragon.headPos : null;
      const a = d.headAng + rr(-1.2, 1.2);
      this.glanceTarget = o || { x: d.x + Math.cos(a) * d.L, y: d.y + Math.sin(a) * d.L };
      this.glanceUntil = this.clock + rr(0.9, 1.8); this.glanceAt = this.glanceUntil + rr(2.5, 7) / (0.4 + ctx.g.curiosity);
    }
    if (this.clock < this.glanceUntil) cmd.look = this.glanceTarget;
  }

  pickWaypoint(m) {
    const d = this.dragon, w = this.world, L = d.L;
    let best = null, bs = -1e9;
    for (let i = 0; i < 8; i++) {
      const x = rr(m, w.W - m), y = rr(m, w.H - m), dist = Math.hypot(x - d.x, y - d.y);
      if (dist < 0.7 * L) continue;
      const turn = Math.abs(angDiff(Math.atan2(y - d.y, x - d.x), d.h));
      let s = -turn * 1.1 - Math.abs(dist - 1.6 * L) / L * 0.5 + rnd() * 1.3;
      // keep out of the way of the rest of the flock
      for (const o of w.dragons) if (o !== d) s -= Math.max(0, 1.2 - Math.hypot(x - o.x, y - o.y) / L) * 1.5;
      if (s > bs) { bs = s; best = { x, y }; }
    }
    return best || { x: rr(m, w.W - m), y: rr(m, w.H - m) };
  }

  // ---------------------------------------------------------------- flocking
  /**
   * Boids in the leader's frame. Each follower has a slot in a loose V behind the leader. Forces:
   *   slot      steer to the slot (stronger with sociability)
   *   separate  keep a body's width from every other dragon's *body*, not just its head
   *   align     match the leader's heading when close
   *   wall      stay inside the page
   * The sum becomes a target point a short way ahead, so Dragon.steer's vehicle model does the rest.
   */
  flock(dt, cmd, ctx) {
    const d = this.dragon, w = this.world, L = d.L, lead = ctx.leader, g = ctx.g;
    const flock = w.dragons.filter(o => o !== lead).sort((a, b) => a.id - b.id), rank = flock.indexOf(d);
    const row = Math.floor(rank / 2) + 1, side = rank % 2 ? 1 : -1;
    const lh = lead.h, fx = Math.cos(lh), fy = Math.sin(lh);
    const LL = Math.max(L, lead.L), back = (0.18 + 0.34 * row) * LL, lat = side * (0.6 + 0.34 * (row - 1)) * LL;
    const wob = 0.1 * LL, tt = this.clock * 0.5 + d.id * 5.1, lead1 = lead.v * 0.3;
    const slot = { x: lead.x + fx * lead1 - fx * (back + wob * Math.sin(tt)) + (-fy) * (lat + wob * Math.sin(tt * 0.77 + 2)), y: lead.y + fy * lead1 - fy * (back + wob * Math.sin(tt)) + fx * (lat + wob * Math.sin(tt * 0.77 + 2)) };
    let vx = 0, vy = 0;
    const dxs = slot.x - d.x, dys = slot.y - d.y, ds = Math.hypot(dxs, dys) || 1;
    const k = 0.5 + 0.8 * g.sociability;
    vx += dxs / ds * k * clamp(ds / L, 0, 1.5); vy += dys / ds * k * clamp(ds / L, 0, 1.5);
    // separation from other bodies
    for (const o of w.dragons) {
      if (o === d) continue;
      let cx = 0, cy = 0, cd = 1e9;
      for (let j = 0; j < M; j += 6) { const s = o.S[j], dd = Math.hypot(s.x - d.x, s.y - d.y) - s.hw; if (dd < cd) { cd = dd; cx = s.x; cy = s.y; } }
      const want = 0.42 * L;
      if (cd < want) { const px = d.x - cx, py = d.y - cy, pl = Math.hypot(px, py) || 1; const f = (want - cd) / want * 2.4; vx += px / pl * f; vy += py / pl * f; }
    }
    // look ahead: a dragon about to walk into another's body turns away early
    for (const k of [0.45, 0.9]) {
      const ax = d.x + Math.cos(d.h) * L * k, ay = d.y + Math.sin(d.h) * L * k;
      for (const o of w.dragons) {
        if (o === d) continue;
        for (let j = 0; j < M; j += 6) {
          const s = o.S[j], dd = Math.hypot(s.x - ax, s.y - ay) - s.hw;
          if (dd < 0.3 * L) { const px = ax - s.x, py = ay - s.y, pl = Math.hypot(px, py) || 1, f = (0.3 * L - dd) / (0.3 * L) * 1.6; vx += px / pl * f; vy += py / pl * f; }
        }
      }
    }
    // alignment with the leader when we are near our slot
    const near = 1 - sstep(0.3 * L, 1.2 * L, ds);
    vx += fx * 0.6 * near; vy += fy * 0.6 * near;
    // walls
    const m = 0.6 * L;
    if (d.x < m) vx += (m - d.x) / m; if (d.x > w.W - m) vx -= (d.x - (w.W - m)) / m;
    if (d.y < m) vy += (m - d.y) / m; if (d.y > w.H - m) vy -= (d.y - (w.H - m)) / m;

    const vl = Math.hypot(vx, vy) || 1;
    cmd.mode = 'go'; cmd.tx = d.x + vx / vl * 0.9 * L; cmd.ty = d.y + vy / vl * 0.9 * L; cmd.stand = 0.05 * L;
    // pace: match the leader when settled, hurry when behind
    const leadRel = lead.v / (0.46 * L * g.speed);
    cmd.speed = clamp(lerp(1.35, Math.max(leadRel, 0.2), near), 0.25, 1.5);
    if (near > 0.85 && lead.v < 0.05 * L) {
      // settled in the slot with the leader standing: stand, facing roughly the leader's way
      const err = Math.abs(angDiff(lh, d.h));
      if (err < 0.7) { cmd.mode = 'hold'; cmd.look = lead.headPos; cmd.tail = 0.3; }
      else { cmd.tx = d.x + fx * 0.5 * L; cmd.ty = d.y + fy * 0.5 * L; cmd.speed = 0.35; }
    }
    cmd.tail = Math.max(cmd.tail, 0.15);
    if (ctx.nearest && ctx.nearest.d < 2 * L && rnd() < dt * 0.4) { /* social glance */ this.glanceTarget = ctx.nearest.dragon.headPos; this.glanceUntil = this.clock + 1.2; }
    if (this.clock < this.glanceUntil) cmd.look = this.glanceTarget;
  }

  /** Keep from walking through another dragon while wandering. */
  avoidOthers(cmd, ctx) {
    const d = this.dragon, w = this.world, L = d.L;
    let ax = 0, ay = 0;
    for (const o of w.dragons) {
      if (o === d) continue;
      for (let j = 0; j < M; j += 6) {
        const s = o.S[j], dd = Math.hypot(s.x - d.x, s.y - d.y) - s.hw;
        if (dd < 0.7 * L) { const px = d.x - s.x, py = d.y - s.y, pl = Math.hypot(px, py) || 1, f = (0.7 * L - dd) / (0.7 * L); ax += px / pl * f; ay += py / pl * f; }
      }
    }
    if (ax || ay) { cmd.tx += ax * L * 1.1; cmd.ty += ay * L * 1.1; }
  }

  // ---------------------------------------------------------------- collision avoidance
  /**
   * Anticipate: any other dragon's body in the corridor ahead bends our target sideways, and the lower-priority
   * dragon (the later one) also slows to let the other pass. Applies on top of whatever locomotion chose the goal.
   */
  avoid(cmd, ctx) {
    const d = this.dragon, w = this.world, L = d.L, hc = Math.cos(d.h), hs = Math.sin(d.h);
    let push = 0, urgent = 0, yieldK = 0;
    for (const o of w.dragons) {
      if (o === d) continue;
      for (let j = 0; j < M; j += 4) {
        const s = o.S[j], rx = s.x - d.x, ry = s.y - d.y, ahead = rx * hc + ry * hs, lat = -rx * hs + ry * hc;
        const clear = s.hw + 0.07 * L + 0.1 * L, reach = 0.85 * L;
        if (ahead < -0.05 * L || ahead > reach || Math.abs(lat) > clear + 0.25 * L) continue;
        const u = (1 - Math.max(0, ahead) / reach) * (1 - clamp((Math.abs(lat) - clear) / (0.25 * L), 0, 1));
        const side = Math.abs(lat) < 2 ? (d.id % 2 ? 1 : -1) : -Math.sign(lat);
        push += side * u; urgent = Math.max(urgent, u);
        if (d.id > o.id) yieldK = Math.max(yieldK, u);
      }
    }
    if (urgent <= 0.02) return;
    const dx = cmd.tx - d.x, dy = cmd.ty - d.y, dl = Math.hypot(dx, dy) || 1, k = clamp(push, -1.6, 1.6) * 1.6;
    // rotate the goal direction by an angle proportional to the push
    const a = Math.atan2(dy, dx) + clamp(k, -1.3, 1.3);
    const reachG = Math.max(dl, 0.6 * L);
    cmd.tx = d.x + Math.cos(a) * reachG; cmd.ty = d.y + Math.sin(a) * reachG;
    cmd.stand = Math.min(cmd.stand ?? 0.1 * L, 0.05 * L);
    cmd.speed = (cmd.speed ?? 1) * (1 - 0.8 * yieldK);
  }

  // ---------------------------------------------------------------- fire
  fireControl(dt, cmd, ctx, userDriven) {
    const p = ctx.pointer, d = this.dragon;
    if (userDriven) {
      if (p.down && !this.prevDown) this.fireHold = 0.55;           // a tap holds the flame for half a second
      this.fireHold = Math.max(0, this.fireHold - dt);
      cmd.breath = p.down || this.fireHold > 0;
    } else if (ctx.isLeader === false && ctx.leader && p.down) {
      if (!this.prevDown) this.mimic = ctx.g.sociability > 0.5 && rnd() < 0.4;
      cmd.breath = cmd.breath || (this.mimic && ctx.leader.breath > 0.3);
    }
    if (cmd.breath) { cmd.wing = Math.max(cmd.wing, 0.6); cmd.mode = cmd.mode === 'curl' ? 'go' : cmd.mode; }
  }
}
