// Sound and haptics, synthesised live (no audio files).
//
// The old version was three looped noise bands, which is why it just sounded like noise. This one is built from
// distinct, designed voices, each with a clear shape over time:
//
//   breath   inhale sweep -> sustained roar (a warm low body + a turbulent mid layer whose cutoff follows intensity,
//            with slow irregular gain wobble like a gas jet) -> release tail that falls away into the room
//   burn     a very quiet low bed, with sparse resonant crackles: each is a tiny noise burst through a narrow
//            bandpass at a random pitch, so they tick and snap instead of hissing
//   hole     a soft low thump (pitch-dropping sine) with a short papery rustle when a piece of page burns through
//   ui       two-note blips for toggles
//
// Everything runs through a gentle compressor and a small generated reverb so the voices sit in one space, and the
// roar and thumps pan with the dragon. Sound starts on the first pointer press (browser rule) and can be muted.

import { clamp } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.vol = 0.8;
    try { this.muted = localStorage.getItem('draco.mute') === '1'; } catch (_) {}
    this.lastBuzz = 0; this.wasBreathing = false; this.crackAcc = 0; this.b = 0; this.gust = 0;
    this.haptics = typeof navigator !== 'undefined' && !!navigator.vibrate;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();

    // master chain: bus -> compressor -> master -> out, with a reverb send
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.25;
    this.bus = c.createGain();
    this.bus.connect(comp); comp.connect(this.master); this.master.connect(c.destination);
    const verb = c.createConvolver(); verb.buffer = this.impulse(1.7, 2.6);
    this.send = c.createGain(); this.send.gain.value = 0.22;
    const vhp = c.createBiquadFilter(); vhp.type = 'highpass'; vhp.frequency.value = 180;
    this.send.connect(verb); verb.connect(vhp); vhp.connect(comp);

    // shared noise (brown-ish for body, white for tick)
    const len = c.sampleRate * 3;
    this.brown = c.createBuffer(1, len, c.sampleRate); this.white = c.createBuffer(1, len, c.sampleRate);
    const bd = this.brown.getChannelData(0), wd = this.white.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; wd[i] = w; last = (last + 0.02 * w) / 1.02; bd[i] = last * 3.2; }

    // --- breath voice (always running, silent until the gain opens)
    this.pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    this.pan.connect(this.bus); this.pan.connect(this.send);
    const loop = (buf, rate = 1) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.loopStart = Math.random() * 2; s.start(); return s; };
    // low body: brown noise, lowpassed, plus two detuned low sines
    this.bodyG = c.createGain(); this.bodyG.gain.value = 0;
    const bodyLp = c.createBiquadFilter(); bodyLp.type = 'lowpass'; bodyLp.frequency.value = 260; bodyLp.Q.value = 0.5;
    loop(this.brown).connect(bodyLp); bodyLp.connect(this.bodyG);
    this.sines = [48, 71].map(f => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.12; o.connect(g); g.connect(this.bodyG); o.start(); return o; });
    this.bodyG.connect(this.pan);
    // turbulent mid layer: white noise through a sweeping lowpass+bandpass, gain wobbled by a slow LFO
    this.jetG = c.createGain(); this.jetG.gain.value = 0;
    this.jetBp = c.createBiquadFilter(); this.jetBp.type = 'bandpass'; this.jetBp.frequency.value = 600; this.jetBp.Q.value = 0.55;
    this.jetLp = c.createBiquadFilter(); this.jetLp.type = 'lowpass'; this.jetLp.frequency.value = 1500;
    loop(this.white, 0.9).connect(this.jetBp); this.jetBp.connect(this.jetLp); this.jetLp.connect(this.jetG); this.jetG.connect(this.pan);
    // inhale / release sweep voice, gain-driven per event
    this.sweepG = c.createGain(); this.sweepG.gain.value = 0;
    this.sweepBp = c.createBiquadFilter(); this.sweepBp.type = 'bandpass'; this.sweepBp.Q.value = 1.4; this.sweepBp.frequency.value = 300;
    loop(this.white, 1.1).connect(this.sweepBp); this.sweepBp.connect(this.sweepG); this.sweepG.connect(this.pan);

    // --- burn bed: barely-there low flutter
    this.bedG = c.createGain(); this.bedG.gain.value = 0;
    const bedLp = c.createBiquadFilter(); bedLp.type = 'lowpass'; bedLp.frequency.value = 520;
    loop(this.brown, 1.4).connect(bedLp); bedLp.connect(this.bedG); this.bedG.connect(this.bus);
  }

  /** A short decaying-noise impulse response for a small, soft room. */
  impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 400 ? i / 400 : 1); }
    return b;
  }

  setMuted(m) {
    this.muted = m; try { localStorage.setItem('draco.mute', m ? '1' : '0'); } catch (_) {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05);
  }

  /** A crackle: a few ms of noise through a narrow resonant band, at a random pitch. */
  crackle(k = 1, pan = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const s = c.createBufferSource(); s.buffer = this.white;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(1400, 5200); bp.Q.value = rnd(4, 12);
    const g = c.createGain(), t = c.currentTime, d = rnd(0.006, 0.022);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rnd(0.22, 0.6) * k, t + 0.0012); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    s.connect(bp); bp.connect(g);
    let out = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan + rnd(-0.3, 0.3), -1, 1); g.connect(p); out = p; }
    out.connect(this.bus); if (Math.random() < 0.5) out.connect(this.send);
    s.start(t, rnd(0, 2.5), d + 0.02);
  }

  /** A page burning through: a falling soft thump and a little paper rustle. */
  thump(k = 1, pan = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(rnd(150, 200), t); o.frequency.exponentialRampToValueAtTime(rnd(48, 62), t + 0.16);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.38 * k, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    let out = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); out = p; }
    o.connect(g); out.connect(this.bus); out.connect(this.send); o.start(t); o.stop(t + 0.32);
    for (let i = 0; i < 4; i++) setTimeout(() => this.crackle(0.5 * k, pan), i * rnd(15, 45));
  }

  /** Whoosh used for the inhale (rising) and the release (falling). */
  sweep(rise, k = 1) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime, f = this.sweepBp.frequency, g = this.sweepG.gain, dur = rise ? 0.38 : 1.1;
    f.cancelScheduledValues(t); g.cancelScheduledValues(t);
    f.setValueAtTime(rise ? 180 : 900, t); f.exponentialRampToValueAtTime(rise ? 1100 : 160, t + dur);
    g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime((rise ? 0.34 : 0.26) * k, t + (rise ? dur * 0.9 : 0.05)); g.exponentialRampToValueAtTime(0.0001, t + dur + (rise ? 0.1 : 0.2));
  }

  /** Two-note UI blip. */
  blip(up = true) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime;
    [0, 1].forEach(i => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      o.frequency.value = (up ? [440, 660] : [660, 440])[i];
      g.gain.setValueAtTime(0, t + i * 0.07); g.gain.linearRampToValueAtTime(0.1, t + i * 0.07 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.18);
      o.connect(g); g.connect(this.bus); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.2);
    });
  }

  /**
   * @param dt  seconds
   * @param s   { breath 0..1, flame (burning cells), pops (holes opened this frame), x (-1..1 pan of the breathing dragon) }
   */
  update(dt, s) {
    const on = s.breath > 0.5, edgeUp = on && !this.wasBreathing, edgeDown = !on && this.wasBreathing;
    if (this.ctx && !this.muted) {
      const c = this.ctx, t = c.currentTime, b = clamp(s.breath, 0, 1), burn = clamp(s.flame / 300, 0, 1);
      if (edgeUp) this.sweep(true); if (edgeDown) this.sweep(false);
      // slow irregular gust, like a pressurised jet
      this.gust += (Math.random() - 0.5) * dt * 9; this.gust *= Math.exp(-dt * 2.2); const gu = 1 + clamp(this.gust, -0.4, 0.4);
      const e = b * b * (3 - 2 * b);                                           // eased intensity
      this.bodyG.gain.setTargetAtTime(0.55 * e * gu, t, 0.09);
      this.jetG.gain.setTargetAtTime(0.42 * e * gu, t, 0.07);
      this.jetBp.frequency.setTargetAtTime(380 + 520 * e * gu, t, 0.1);
      this.jetLp.frequency.setTargetAtTime(900 + 1500 * e, t, 0.12);
      this.sines[0].frequency.setTargetAtTime(46 + 8 * e, t, 0.2);
      if (this.pan.pan) this.pan.pan.setTargetAtTime(clamp(s.x || 0, -1, 1) * 0.6, t, 0.1);
      this.bedG.gain.setTargetAtTime(0.16 * burn, t, 0.3);
      // sparse crackle: rate follows how much is burning; stronger while the breath is on it
      this.crackAcc += dt * (burn * 22 + (s.flame > 0 ? 2 : 0) + (on ? 6 * burn : 0));
      let n = 0; while (this.crackAcc >= 1 && n < 3) { this.crackAcc -= 1; this.crackle(0.5 + burn, s.x || 0); n++; }
      this.crackAcc = Math.min(this.crackAcc, 1.5);
      if (s.pops > 0) this.thump(clamp(0.5 + s.pops * 0.25, 0.5, 1.2), s.x || 0);
    }
    // haptics: a thud as the breath starts, a low rumble while it lasts, a tick for each hole
    if (this.haptics) {
      const now = performance.now();
      if (edgeUp) { navigator.vibrate(20); this.lastBuzz = now; }
      else if (on && now - this.lastBuzz > 110) { navigator.vibrate(6 + (Math.random() * 5 | 0)); this.lastBuzz = now; }
      else if (s.pops > 0 && now - this.lastBuzz > 120) { navigator.vibrate(5); this.lastBuzz = now; }
    }
    this.wasBreathing = on;
  }
}
