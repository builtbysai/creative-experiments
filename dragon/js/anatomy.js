// Anatomy turns a Genome into concrete proportions. It is rebuilt only when the genome changes.
// All lengths are fractions of the dragon's unit length L.

import { clamp, lerp, sstep } from './util.js';

export const N = 40;                    // spine control points
export const SUB = 3;                   // Catmull-Rom subdivision
export const M = (N - 1) * SUB + 1;     // drawn spine samples

const PROF = [[0, .030], [.04, .037], [.09, .033], [.15, .047], [.25, .059], [.36, .057], [.46, .051], [.58, .043], [.70, .031], [.82, .020], [.92, .0105], [1, .003]];
const BASE_ANCHORS = [0, 0.09, 0.185, 0.575, 1];

function profBase(t) {
  for (let i = 1; i < PROF.length; i++) {
    if (t <= PROF[i][0]) {
      const [a, pa] = PROF[i - 1], [b, pb] = PROF[i];
      return lerp(pa, pb, sstep(0, 1, (t - a) / (b - a)));
    }
  }
  return PROF[PROF.length - 1][1];
}

export class Anatomy {
  constructor(genome) { this.rebuild(genome); }

  rebuild(genome) {
    const v = genome.v;
    this.rev = genome.rev;
    this.v = v;

    // where things sit along the body (0 = nose end of the spine, 1 = tail tip)
    this.shoulderT = clamp(0.185 + (v.neck - 1) * 0.07, 0.13, 0.29);
    this.hipT = clamp(this.shoulderT + (0.575 - 0.185) * v.torso, this.shoulderT + 0.2, 0.8);
    const neckEnd = Math.min(0.09 * v.neck, this.shoulderT - 0.05);
    this.anchors = [0, neckEnd, this.shoulderT, this.hipT, 1];
    this.girth = v.bulk;
    this.tailK = v.tail;

    // legs: a, b = upper and lower bone; lat = how far out the foot lands; fw = how far ahead of the hip
    const ll = v.legLength, st = v.stance;
    this.leg = {
      front: { a: 0.062 * ll, b: 0.058 * ll, lat: 0.106 * st * (0.6 + 0.4 * v.bulk), fw: 0.044 },
      hind: { a: 0.068 * ll, b: 0.060 * ll, lat: 0.108 * st * (0.6 + 0.4 * v.bulk), fw: -0.004 },
      thick: v.legThick,
      toesFront: v.toes,
      toesHind: clamp(v.toes + 1, 3, 5),
      claw: v.claws
    };

    // wings: finger angles and lengths resampled for any finger count
    const nF = v.wingFingers, f = i => (nF === 1 ? 0 : i / (nF - 1));
    const baseLens = [0.30, 0.35, 0.32, 0.25];
    const sampleLen = u => { const x = u * 3, i = Math.min(2, Math.floor(x)); return lerp(baseLens[i], baseLens[i + 1], x - i); };
    this.wing = {
      fingers: nF, span: v.wingSpan,
      open: Array.from({ length: nF }, (_, i) => lerp(0.8, 2.26, f(i))),
      fold: Array.from({ length: nF }, (_, i) => lerp(3.1, 3.34, f(i))),
      lens: Array.from({ length: nF }, (_, i) => sampleLen(f(i)) * v.wingSpan),
      armLen: 0.18 * Math.pow(v.wingSpan, 0.8),
      shoulderT: this.shoulderT - 0.02,
      baseT: clamp(this.hipT * 0.87, this.shoulderT + 0.1, 0.7),
      membrane: v.membrane, scallop: v.scallop
    };

    this.head = { snout: v.snout, size: v.headSize, horns: v.horns, frill: v.frill, cheeks: v.cheeks };
    this.spine = { size: v.spikes, gap: v.spikeGap, shape: v.spikeShape, blade: v.blade };
    this.skin = { scale: v.scaleSize, pattern: v.pattern, amount: v.patternAmount, gloss: v.gloss };
    this.fire = { reach: v.reach, rate: v.fireRate, hue: v.fireHue };
  }

  /** Half-width of the body at t, in units of L. */
  halfWidth(t) {
    const a = this.anchors, B = BASE_ANCHORS;
    let bt = t;
    for (let i = 1; i < a.length; i++) {
      if (t <= a[i]) { bt = lerp(B[i - 1], B[i], (t - a[i - 1]) / (a[i] - a[i - 1] || 1)); break; }
    }
    const tail = lerp(1, this.tailK, sstep(0.42, 0.85, t));
    return Math.max(0.003, profBase(bt) * this.girth * tail * (t < 0.1 ? this.head.size ** 0.4 : 1));
  }
}
