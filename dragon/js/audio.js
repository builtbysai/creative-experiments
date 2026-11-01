// Synthesised sound and haptics. There are no audio files: a looped noise buffer is filtered into a roar for the
// breath, and short enveloped noise bursts become the crackle of burning paper. Sound is off until the first
// pointer press (browsers require a gesture), and can be muted from the panel.

import { clamp } from './util.js';

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.vol = 0.7;
    try { this.muted = localStorage.getItem('draco.mute') === '1'; } catch (_) {}
    this.lastBuzz = 0; this.wasBreathing = false; this.crackAcc = 0;
    this.haptics = typeof navigator !== 'undefined' && !!navigator.vibrate;
  }

  /** Call from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(c.destination);
    // 2 s of noise, shared
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;                           // pinkish noise: sounds more like fire than white
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    this.noise = buf;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.roarBand = c.createBiquadFilter(); this.roarBand.type = 'bandpass'; this.roarBand.frequency.value = 520; this.roarBand.Q.value = 0.7;
    this.roarLow = c.createBiquadFilter(); this.roarLow.type = 'lowpass'; this.roarLow.frequency.value = 1400;
    this.roar = c.createGain(); this.roar.gain.value = 0;
    src.connect(this.roarBand); this.roarBand.connect(this.roarLow); this.roarLow.connect(this.roar); this.roar.connect(this.master); src.start();
    // a low rumble under it
    const src2 = c.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 0.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    this.rumble = c.createGain(); this.rumble.gain.value = 0;
    src2.connect(lp); lp.connect(this.rumble); this.rumble.connect(this.master); src2.start();
    // the soft hiss of a steady burn
    const src3 = c.createBufferSource(); src3.buffer = buf; src3.loop = true; src3.playbackRate.value = 1.3;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    this.hiss = c.createGain(); this.hiss.gain.value = 0;
    src3.connect(hp); hp.connect(this.hiss); this.hiss.connect(this.master); src3.start();
  }

  setMuted(m) {
    this.muted = m; try { localStorage.setItem('draco.mute', m ? '1' : '0'); } catch (_) {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.05);
  }

  /** One crackle: a few milliseconds of high-passed noise with a sharp decay. */
  pop(strength = 1) {
    const c = this.ctx; if (!c || this.muted) return;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900 + Math.random() * 3200;
    const g = c.createGain(), now = c.currentTime, dur = 0.008 + Math.random() * 0.03;
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.22 * strength * (0.4 + Math.random() * 0.6), now + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now, Math.random() * 1.8, dur + 0.02);
  }

  /**
   * @param dt        seconds
   * @param s         { breath: 0..1 (strongest dragon), flame: burning paper cells, pops: ignitions and holes this frame }
   */
  update(dt, s) {
    if (this.ctx && !this.muted) {
      const c = this.ctx, t = c.currentTime;
      const b = clamp(s.breath, 0, 1), burn = clamp(s.flame / 300, 0, 1);
      this.roar.gain.setTargetAtTime(0.5 * b, t, 0.06);
      this.roarBand.frequency.setTargetAtTime(380 + 420 * b, t, 0.1);
      this.rumble.gain.setTargetAtTime(0.7 * b, t, 0.1);
      this.hiss.gain.setTargetAtTime(0.1 * burn, t, 0.2);
      // crackle rate follows how much is burning
      this.crackAcc += dt * (burn * 70 + (s.flame > 0 ? 5 : 0)) + s.pops * 0.3;
      let n = 0; while (this.crackAcc >= 1 && n < 6) { this.crackAcc -= 1; this.pop(0.5 + burn); n++; }
      this.crackAcc = Math.min(this.crackAcc, 2);
      if (b > 0.5 && !this.wasBreathing) this.pop(2);
    }
    // haptics: a thud as the breath starts, then a rough rumble while it lasts and a flutter while paper burns
    if (this.haptics) {
      const now = performance.now();
      if (s.breath > 0.5 && !this.wasBreathing) { navigator.vibrate(18); this.lastBuzz = now; }
      else if (s.breath > 0.5 && now - this.lastBuzz > 90) { navigator.vibrate(7 + (Math.random() * 6 | 0)); this.lastBuzz = now; }
      else if (s.flame > 40 && s.pops > 0 && now - this.lastBuzz > 120) { navigator.vibrate(4); this.lastBuzz = now; }
    }
    this.wasBreathing = s.breath > 0.5;
  }
}
