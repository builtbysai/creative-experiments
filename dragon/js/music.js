// Ambience: a quiet generative score and the sounds of the place, all synthesised live.
//
//   Score    a slow pad that changes chord every ~14 s, and now and then a soft bell note from a pentatonic scale. Each
//            background has its own key and mood (paper: warm D minor; garden: bright C major, then a hushed A minor at
//            night; weather: open, suspended chords). The whole score ducks while a dragon breathes fire.
//   Place    garden: birdsong by day, crickets at night. weather: rain, wind that follows the gusts, a far rumble of
//            thunder in the rain, and a muffled score in fog.
//
// It hangs off the Sound's bus and reverb, so it sits in the same room as the dragons' own voices.

import { clamp } from './util.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

// pad chords (Hz) and bell scales per mood
const MOODS = {
  paper: {
    chords: [[146.83, 220, 293.66, 349.23], [116.54, 174.61, 233.08, 293.66], [174.61, 261.63, 349.23, 440], [130.81, 196, 261.63, 329.63]],
    scale: [293.66, 349.23, 392, 440, 523.25, 587.33, 698.46], every: [3.5, 8], cut: 1100
  },
  garden: {
    chords: [[130.81, 196, 261.63, 329.63], [174.61, 261.63, 349.23, 440], [110, 164.81, 220, 329.63], [196, 293.66, 392, 493.88]],
    scale: [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7], every: [3, 7], cut: 1500
  },
  night: {
    chords: [[110, 164.81, 220, 261.63], [87.31, 130.81, 174.61, 261.63], [130.81, 196, 261.63, 329.63], [98, 146.83, 196, 293.66]],
    scale: [329.63, 392, 440, 523.25, 587.33, 659.25], every: [6, 14], cut: 800
  },
  weather: {
    chords: [[146.83, 164.81, 220, 293.66], [110, 146.83, 164.81, 220], [98, 110, 146.83, 196], [146.83, 164.81, 220, 293.66]],
    scale: [293.66, 329.63, 440, 493.88, 587.33], every: [5, 11], cut: 700
  }
};

export class Ambience {
  constructor(snd) {
    this.s = snd; const c = this.c = snd.ctx;
    this.on = true; try { this.on = localStorage.getItem('draco.music') !== '0'; } catch (_) {}
    this.mood = 'paper'; this.chordI = 0; this.chordT = 0; this.noteT = 2; this.birdT = 3; this.thunderT = rnd(20, 40); this.voices = [];
    // score chain: voices -> lowpass -> gain -> bus + reverb
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 1100; this.lp.Q.value = 0.4;
    this.g = c.createGain(); this.g.gain.value = 0;
    this.lp.connect(this.g); this.g.connect(snd.bus); const send = c.createGain(); send.gain.value = 0.55; this.g.connect(send); send.connect(snd.send);
    // place chain
    this.place = c.createGain(); this.place.gain.value = 1; this.place.connect(snd.bus);
    const loop = (buf, rate = 1) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * 2); return s; };
    // rain: a soft hiss, band-limited so it reads as drops on paper rather than static
    this.rainG = c.createGain(); this.rainG.gain.value = 0;
    const rhp = c.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1400; const rlp = c.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 7500;
    loop(snd.white, 0.8).connect(rhp); rhp.connect(rlp); rlp.connect(this.rainG); this.rainG.connect(this.place);
    // wind: noise through a moving bandpass
    this.windG = c.createGain(); this.windG.gain.value = 0; this.windBp = c.createBiquadFilter(); this.windBp.type = 'bandpass'; this.windBp.frequency.value = 420; this.windBp.Q.value = 0.8;
    loop(snd.brown, 1.6).connect(this.windBp); this.windBp.connect(this.windG); this.windG.connect(this.place);
    // crickets: a high tone chopped fast, then gated slowly in phrases
    this.cricG = c.createGain(); this.cricG.gain.value = 0.5; this.cricLevel = c.createGain(); this.cricLevel.gain.value = 0;
    const co = c.createOscillator(); co.type = 'sine'; co.frequency.value = 4350; const cam = c.createGain(); cam.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 34; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(cam.gain);
    const bias = c.createConstantSource ? c.createConstantSource() : null; if (bias) { bias.offset.value = 0.5; bias.connect(cam.gain); bias.start(); }
    const phr = c.createOscillator(); phr.type = 'sine'; phr.frequency.value = 0.37; const pg = c.createGain(); pg.gain.value = 0.5; phr.connect(pg); pg.connect(this.cricG.gain);
    co.connect(cam); cam.connect(this.cricG); this.cricG.connect(this.cricLevel); this.cricLevel.connect(this.place); co.start(); lfo.start(); phr.start();
  }

  setOn(v) { this.on = v; try { localStorage.setItem('draco.music', v ? '1' : '0'); } catch (_) {} }

  /** A soft pad: four voices (sine + triangle) that swell in and out. */
  chord(notes, dur) {
    const c = this.c, t = c.currentTime, out = [];
    for (const f of notes) for (const [type, det, lv] of [['sine', 0, 0.05], ['triangle', 4, 0.022]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; o.detune.value = det + rnd(-3, 3);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 4.5); g.gain.setValueAtTime(lv, t + dur - 3); g.gain.linearRampToValueAtTime(0, t + dur + 4);
      o.connect(g); g.connect(this.lp); o.start(t); o.stop(t + dur + 4.2); out.push(o);
    }
    return out;
  }

  /** A bell-like note: a sine with a quiet octave partial and a long soft decay. */
  bell(f, vel = 1) {
    const c = this.c, t = c.currentTime, g = c.createGain(), pan = c.createStereoPanner ? c.createStereoPanner() : null;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1 * vel, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + 3.2);
    for (const [m, lv] of [[1, 1], [2.005, 0.22], [3.01, 0.06]]) { const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = lv; o.connect(og); og.connect(g); o.start(t); o.stop(t + 3.3); }
    if (pan) { pan.pan.value = rnd(-0.6, 0.6); g.connect(pan); pan.connect(this.lp); } else g.connect(this.lp);
  }

  /** A short bird phrase: two to five quick chirps that glide up or down. */
  bird() {
    const c = this.c, t0 = c.currentTime, pan = c.createStereoPanner ? c.createStereoPanner() : null, base = rnd(2400, 4200), n = 2 + (Math.random() * 4 | 0), up = Math.random() < 0.5;
    if (pan) { pan.pan.value = rnd(-0.9, 0.9); pan.connect(this.place); }
    for (let i = 0; i < n; i++) {
      const t = t0 + i * rnd(0.09, 0.15), o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(base * (up ? 0.85 : 1.15), t); o.frequency.exponentialRampToValueAtTime(base * (up ? 1.2 : 0.8), t + 0.07);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
      o.connect(g); g.connect(pan || this.place); o.start(t); o.stop(t + 0.1);
    }
  }

  /** A far rumble: low brown noise with a long swell and fall. */
  thunder() {
    const c = this.c, t = c.currentTime, s = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.s.brown; s.loop = true; lp.type = 'lowpass'; lp.frequency.setValueAtTime(220, t); lp.frequency.exponentialRampToValueAtTime(70, t + 3.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.35); g.gain.setTargetAtTime(0.0001, t + 0.5, 1.1);
    s.connect(lp); lp.connect(g); g.connect(this.place); g.connect(this.s.send); s.start(t, rnd(0, 2)); s.stop(t + 5);
  }

  /**
   * @param dt seconds
   * @param s  { scene: 'paper'|'garden'|'weather', dark, rain 0..1, wind px/s, fog 0..1, breath 0..1 }
   */
  update(dt, s) {
    if (!this.c || this.s.muted) return;
    const c = this.c, t = c.currentTime;
    const mood = s.scene === 'garden' ? (s.dark ? 'night' : 'garden') : s.scene === 'weather' ? 'weather' : 'paper', M = MOODS[mood];
    if (mood !== this.mood) { this.mood = mood; this.chordT = 0; this.noteT = 1.5; }
    const duck = 1 - 0.55 * clamp(s.breath, 0, 1), fog = clamp(s.fog || 0, 0, 1);
    this.g.gain.setTargetAtTime(this.on ? 0.9 * duck : 0, t, this.on ? 0.6 : 0.3);
    this.lp.frequency.setTargetAtTime(M.cut * (1 - 0.55 * fog), t, 1.2);
    // chords and bells (only while the score is on, so a muted score costs nothing)
    if (this.on) {
      this.chordT -= dt; if (this.chordT <= 0) { this.chordT = 14; this.chord(M.chords[this.chordI++ % M.chords.length], 14); }
      this.noteT -= dt; if (this.noteT <= 0) { this.noteT = rnd(M.every[0], M.every[1]); this.bell(pick(M.scale), rnd(0.5, 1)); if (Math.random() < 0.3) setTimeout(() => this.on && this.bell(pick(M.scale), 0.55), rnd(250, 700)); }
    }
    // the place
    const rain = s.scene === 'weather' ? clamp(s.rain || 0, 0, 1) : 0, wind = s.scene === 'weather' ? clamp((s.wind || 0) / 220, 0, 1.2) : 0;
    this.rainG.gain.setTargetAtTime(0.11 * rain, t, 0.6);
    this.windG.gain.setTargetAtTime(0.5 * wind * wind + 0.05 * (s.scene === 'weather' ? 1 : 0), t, 0.5);
    this.windBp.frequency.setTargetAtTime(260 + 520 * wind + 120 * Math.sin(performance.now() / 1900), t, 0.4);
    this.cricLevel.gain.setTargetAtTime(s.scene === 'garden' && s.dark ? 0.014 : 0, t, 1.5);
    if (s.scene === 'garden' && !s.dark) { this.birdT -= dt; if (this.birdT <= 0) { this.birdT = rnd(1.2, 5); this.bird(); } }
    if (rain > 0.5) { this.thunderT -= dt; if (this.thunderT <= 0) { this.thunderT = rnd(25, 55); this.thunder(); } }
  }
}
