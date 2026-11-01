// A Genome is the whole recipe for one dragon: proportions, limbs, wings, head, colours and temperament.
// The editor panel is generated from SCHEMA, so adding a parameter here adds a control there.

import { clamp, hsl, Rng } from './util.js';

const P = (key, label, group, def, min, max, step, extra = {}) => ({ key, label, group, type: 'range', def, min, max, step, ...extra });
const H = (key, label, group, def, extra = {}) => ({ key, label, group, type: 'hue', def, min: 0, max: 360, step: 1, ...extra });
const S = (key, label, group, def, options) => ({ key, label, group, type: 'select', def, options });

export const GROUPS = ['Body', 'Legs', 'Wings', 'Head', 'Spines', 'Skin', 'Fire', 'Behaviour'];

export const SCHEMA = [
  // ---- body ----
  P('size', 'Size', 'Body', 1, 0.45, 1.7, 0.01, { hint: 'overall scale' }),
  P('length', 'Length', 'Body', 1, 0.7, 1.6, 0.01, { hint: 'longer or shorter body' }),
  P('bulk', 'Girth', 'Body', 1, 0.6, 1.55, 0.01),
  P('neck', 'Neck', 'Body', 1, 0.6, 1.7, 0.01),
  P('torso', 'Torso', 'Body', 1, 0.75, 1.3, 0.01),
  P('tail', 'Tail thickness', 'Body', 1, 0.5, 1.8, 0.01),
  P('blade', 'Tail blade', 'Body', 1, 0, 1.8, 0.01),
  // ---- legs ----
  P('legLength', 'Leg length', 'Legs', 1, 0.7, 1.45, 0.01),
  P('legThick', 'Leg thickness', 'Legs', 1, 0.6, 1.6, 0.01),
  P('stance', 'Stance width', 'Legs', 1, 0.7, 1.4, 0.01),
  P('toes', 'Toes', 'Legs', 4, 3, 5, 1, { int: true }),
  P('claws', 'Claw length', 'Legs', 1, 0.3, 2.2, 0.01),
  // ---- wings ----
  P('wingSpan', 'Wing span', 'Wings', 1, 0.45, 1.6, 0.01),
  P('wingFingers', 'Wing fingers', 'Wings', 4, 3, 5, 1, { int: true }),
  P('membrane', 'Membrane', 'Wings', 1, 0.45, 1.2, 0.01, { hint: 'how opaque the wing skin is' }),
  P('scallop', 'Scalloping', 'Wings', 1, 0, 2, 0.01),
  // ---- head ----
  P('snout', 'Snout', 'Head', 1, 0.7, 1.55, 0.01),
  P('headSize', 'Head size', 'Head', 1, 0.7, 1.5, 0.01),
  P('horns', 'Horns', 'Head', 1, 0, 2, 0.01),
  P('frill', 'Ear frills', 'Head', 1, 0, 2, 0.01),
  P('cheeks', 'Cheek spines', 'Head', 1, 0, 2, 0.01),
  // ---- spines ----
  P('spikes', 'Spine size', 'Spines', 1, 0, 2.2, 0.01),
  P('spikeGap', 'Spine spacing', 'Spines', 1, 0.6, 2, 0.01),
  S('spikeShape', 'Spine shape', 'Spines', 'blade', [['blade', 'Blades'], ['fin', 'Fins'], ['horn', 'Curved horns']]),
  // ---- skin ----
  H('hue', 'Hue', 'Skin', 6),
  P('sat', 'Saturation', 'Skin', 0.6, 0, 1, 0.01),
  P('light', 'Lightness', 'Skin', 0.32, 0.12, 0.62, 0.01),
  H('bellyHue', 'Belly hue', 'Skin', 40),
  P('bellyLight', 'Belly lightness', 'Skin', 0.63, 0.35, 0.85, 0.01),
  H('accentHue', 'Spine and gold', 'Skin', 41),
  H('wingHue', 'Wing hue', 'Skin', 4),
  H('eyeHue', 'Eye hue', 'Skin', 43),
  P('scaleSize', 'Scale size', 'Skin', 1, 0.5, 2, 0.01),
  S('pattern', 'Pattern', 'Skin', 'none', [['none', 'Plain'], ['bands', 'Bands'], ['stripes', 'Stripes'], ['spots', 'Spots'], ['rosettes', 'Rosettes']]),
  P('patternAmount', 'Pattern strength', 'Skin', 0.6, 0, 1, 0.01),
  P('gloss', 'Gloss', 'Skin', 1, 0, 1.8, 0.01),
  // ---- fire ----
  H('fireHue', 'Flame hue', 'Fire', 28),
  P('reach', 'Reach', 'Fire', 1, 0.5, 2, 0.01),
  P('fireRate', 'Intensity', 'Fire', 1, 0.4, 2, 0.01),
  // ---- behaviour ----
  P('speed', 'Walking speed', 'Behaviour', 1, 0.5, 1.7, 0.01),
  P('agility', 'Agility', 'Behaviour', 1, 0.6, 1.8, 0.01, { hint: 'how tightly it can turn' }),
  P('curiosity', 'Curiosity', 'Behaviour', 0.6, 0, 1, 0.01),
  P('laziness', 'Laziness', 'Behaviour', 0.4, 0, 1, 0.01, { hint: 'sleeps sooner, wanders less' }),
  P('sociability', 'Sociability', 'Behaviour', 0.6, 0, 1, 0.01),
  P('pyro', 'Pyromania', 'Behaviour', 0.5, 0, 1, 0.01, { hint: 'how often it burns words on its own' })
];

const BY_KEY = Object.fromEntries(SCHEMA.map(s => [s.key, s]));
const DEFAULTS = Object.fromEntries(SCHEMA.map(s => [s.key, s.def]));

/** Named starting points. Each is only the values that differ from the default ember dragon. */
export const PRESETS = {
  Ember: {},
  Verdant: { hue: 128, sat: 0.5, light: 0.27, bellyHue: 70, bellyLight: 0.66, accentHue: 52, wingHue: 150, eyeHue: 52, fireHue: 95, pattern: 'bands', patternAmount: 0.4 },
  Frost: { hue: 200, sat: 0.55, light: 0.42, bellyHue: 190, bellyLight: 0.8, accentHue: 190, wingHue: 215, eyeHue: 190, fireHue: 195, pattern: 'none', gloss: 1.5, horns: 1.4, spikes: 1.4 },
  Obsidian: { hue: 265, sat: 0.18, light: 0.15, bellyHue: 275, bellyLight: 0.38, accentHue: 24, wingHue: 280, eyeHue: 20, fireHue: 12, gloss: 1.6, spikeShape: 'horn', horns: 1.4 },
  Gilded: { hue: 40, sat: 0.72, light: 0.38, bellyHue: 48, bellyLight: 0.78, accentHue: 46, wingHue: 36, eyeHue: 10, fireHue: 44, pattern: 'rosettes', patternAmount: 0.5, spikeShape: 'fin' },
  Amethyst: { hue: 285, sat: 0.45, light: 0.36, bellyHue: 310, bellyLight: 0.7, accentHue: 320, wingHue: 295, eyeHue: 320, fireHue: 300, pattern: 'spots', patternAmount: 0.5 },
  Wyrmling: { size: 0.62, length: 0.85, headSize: 1.35, snout: 0.8, legLength: 1.1, wingSpan: 0.7, horns: 0.6, speed: 1.3, agility: 1.4, curiosity: 0.95, laziness: 0.15, hue: 18, sat: 0.7, light: 0.4 },
  Elder: { size: 1.35, length: 1.3, bulk: 1.2, horns: 1.7, frill: 1.5, spikes: 1.6, speed: 0.7, agility: 0.8, laziness: 0.7, hue: 8, sat: 0.38, light: 0.24, wingSpan: 1.3, curiosity: 0.3 }
};

const ARCHETYPES = [
  { hue: 6, sat: 0.6, light: 0.32, bellyHue: 40, accentHue: 41, wingHue: 4, eyeHue: 43, fireHue: 28 },
  { hue: 128, sat: 0.5, light: 0.27, bellyHue: 70, accentHue: 52, wingHue: 150, eyeHue: 52, fireHue: 95 },
  { hue: 200, sat: 0.55, light: 0.42, bellyHue: 190, accentHue: 190, wingHue: 215, eyeHue: 190, fireHue: 195 },
  { hue: 265, sat: 0.2, light: 0.16, bellyHue: 275, accentHue: 24, wingHue: 280, eyeHue: 20, fireHue: 12 },
  { hue: 40, sat: 0.72, light: 0.38, bellyHue: 48, accentHue: 46, wingHue: 36, eyeHue: 10, fireHue: 44 },
  { hue: 285, sat: 0.45, light: 0.36, bellyHue: 310, accentHue: 320, wingHue: 295, eyeHue: 320, fireHue: 300 },
  { hue: 172, sat: 0.55, light: 0.3, bellyHue: 150, accentHue: 40, wingHue: 176, eyeHue: 38, fireHue: 160 },
  { hue: 340, sat: 0.55, light: 0.34, bellyHue: 20, accentHue: 30, wingHue: 345, eyeHue: 50, fireHue: 350 }
];

export class Genome {
  constructor(values = {}) {
    this.v = { ...DEFAULTS };
    this.rev = 0;
    this.patch(values, true);
  }

  get(k) { return this.v[k]; }

  /** Clamp and set one or many values. Bumps `rev` so dragons know to rebuild their anatomy. */
  patch(obj, silent = false) {
    for (const k in obj) {
      const s = BY_KEY[k];
      if (!s) continue;
      let val = obj[k];
      if (s.type === 'select') val = s.options.some(o => o[0] === val) ? val : s.def;
      else { val = Number(val); if (!Number.isFinite(val)) val = s.def; val = clamp(val, s.min, s.max); if (s.int) val = Math.round(val); }
      this.v[k] = val;
    }
    if (!silent) this.rev++;
    return this;
  }
  set(k, val) { return this.patch({ [k]: val }); }
  clone() { return new Genome(this.v); }
  reset() { return this.patch(DEFAULTS); }

  static preset(name) { return new Genome(PRESETS[name] || {}); }

  /** A new coherent dragon: a colour archetype, shuffled proportions, and a temperament. */
  static random(seed = (Math.random() * 1e9) | 0) {
    const r = new Rng(seed), a = r.pick(ARCHETYPES), g = new Genome();
    const j = (c, w) => c + r.range(-w, w);
    g.patch({
      hue: j(a.hue, 8), sat: clamp(j(a.sat, 0.1), 0, 1), light: j(a.light, 0.04), bellyHue: j(a.bellyHue, 12), bellyLight: r.range(0.55, 0.8),
      accentHue: j(a.accentHue, 10), wingHue: j(a.wingHue, 12), eyeHue: j(a.eyeHue, 14), fireHue: j(a.fireHue, 10),
      size: r.range(0.75, 1.3), length: r.range(0.85, 1.35), bulk: r.range(0.8, 1.3), neck: r.range(0.8, 1.4), torso: r.range(0.9, 1.15), tail: r.range(0.7, 1.4),
      blade: r.chance(0.7) ? r.range(0.6, 1.5) : 0,
      legLength: r.range(0.85, 1.25), legThick: r.range(0.8, 1.3), stance: r.range(0.85, 1.2), toes: r.pick([4, 4, 5, 3]), claws: r.range(0.6, 1.7),
      wingSpan: r.range(0.7, 1.4), wingFingers: r.pick([3, 4, 4, 5]), membrane: r.range(0.7, 1.1), scallop: r.range(0.5, 1.6),
      snout: r.range(0.8, 1.4), headSize: r.range(0.85, 1.3), horns: r.range(0.4, 1.8), frill: r.range(0.3, 1.7), cheeks: r.range(0.3, 1.7),
      spikes: r.range(0.5, 1.8), spikeGap: r.range(0.8, 1.5), spikeShape: r.pick(['blade', 'blade', 'fin', 'horn']),
      scaleSize: r.range(0.7, 1.6), pattern: r.pick(['none', 'none', 'bands', 'stripes', 'spots', 'rosettes']), patternAmount: r.range(0.35, 0.8), gloss: r.range(0.6, 1.5),
      reach: r.range(0.8, 1.4), fireRate: r.range(0.8, 1.3),
      speed: r.range(0.75, 1.3), agility: r.range(0.8, 1.4), curiosity: r.range(0.2, 1), laziness: r.range(0.1, 0.8), sociability: r.range(0.2, 1), pyro: r.range(0.2, 0.9)
    });
    g.seed = seed;
    return g;
  }

  /** A slightly different relative: each numeric trait drifts by up to `amount` of its range. */
  mutate(amount = 0.15, rng = new Rng((Math.random() * 1e9) | 0)) {
    const out = this.clone();
    for (const s of SCHEMA) {
      if (s.type === 'select') { if (rng.chance(amount * 0.4)) out.v[s.key] = rng.pick(s.options)[0]; continue; }
      const span = s.max - s.min;
      let nv = out.v[s.key] + rng.gauss() * span * amount * 0.5;
      if (s.type === 'hue') nv = ((nv % 360) + 360) % 360;
      out.v[s.key] = s.int ? Math.round(clamp(nv, s.min, s.max)) : clamp(nv, s.min, s.max);
    }
    out.rev++;
    return out;
  }

  /** Mix two genomes: each trait comes from one parent, with a little blending for numbers. */
  static cross(a, b, rng = new Rng((Math.random() * 1e9) | 0)) {
    const out = new Genome();
    for (const s of SCHEMA) {
      if (s.type === 'select') { out.v[s.key] = rng.chance(0.5) ? a.v[s.key] : b.v[s.key]; continue; }
      const t = rng.chance(0.5) ? rng.range(0, 0.3) : rng.range(0.7, 1);
      let nv = a.v[s.key] + (b.v[s.key] - a.v[s.key]) * t;
      if (s.type === 'hue') { let d = ((b.v[s.key] - a.v[s.key] + 540) % 360) - 180; nv = (a.v[s.key] + d * t + 360) % 360; }
      out.v[s.key] = s.int ? Math.round(nv) : nv;
    }
    return out;
  }

  // ---- (de)serialisation: only what differs from the defaults, so share links stay short ----
  toJSON() {
    const o = {};
    for (const s of SCHEMA) { const val = this.v[s.key]; if (val !== s.def) o[s.key] = s.type === 'select' ? val : +Number(val).toFixed(3); }
    return o;
  }
  static fromJSON(o) { return new Genome(o || {}); }
  encode() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.toJSON())))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  static decode(s) {
    try {
      const b = s.replace(/-/g, '+').replace(/_/g, '/'), pad = b + '==='.slice((b.length + 3) % 4);
      return Genome.fromJSON(JSON.parse(decodeURIComponent(escape(atob(pad)))));
    } catch (_) { return null; }
  }

  /** Every colour the renderer needs, derived from a handful of hues so a single slider recolours the whole animal. */
  palette(dark) {
    const v = this.v, lift = dark ? 0.035 : 0;
    const skin = hsl(v.hue, v.sat, v.light + lift);
    const skinDeep = hsl(v.hue - 2, Math.min(1, v.sat + 0.12), (v.light + lift) * 0.5);
    const skinLight = hsl(v.hue + 4, Math.min(1, v.sat + 0.02), Math.min(0.78, v.light + lift + 0.22));
    const belly = hsl(v.bellyHue, 0.77 * (0.4 + v.sat), v.bellyLight);
    const bellyDeep = hsl(v.bellyHue - 3, 0.63 * (0.4 + v.sat), v.bellyLight * 0.64);
    const spike = hsl(v.accentHue, 0.84, 0.66);
    const horn = hsl(v.accentHue + 5, 0.6, 0.85);
    const hornDark = hsl(v.accentHue - 4, 0.5, 0.36);
    const wingA = hsl(v.wingHue, Math.min(1, v.sat + 0.1), (v.light + lift) * 0.82);
    const wingB = hsl(v.wingHue + 16, Math.min(1, v.sat + 0.08), Math.min(0.7, (v.light + lift) * 1.7));
    return {
      skin, skinDeep, skinLight, belly, bellyDeep, spike, horn, hornDark, wingA, wingB,
      wingVein: hsl(v.wingHue, 0.5, dark ? 0.05 : 0.1),
      rim: hsl(v.hue, 0.6, dark ? 0.035 : 0.07),
      rimLight: dark ? 'rgba(255,175,115,0.30)' : '',
      eye: hsl(v.eyeHue, 1, 0.62), eyeDeep: hsl(v.eyeHue - 14, 0.8, 0.4), eyeCore: hsl(v.eyeHue + 5, 1, 0.88),
      mouth: hsl(v.hue - 2, 0.75, 0.17), tongue: hsl(v.hue + 4, 0.62, 0.47),
      pattern: hsl(v.hue + 6, Math.min(1, v.sat + 0.1), (v.light + lift) * 0.42),
      patternLight: hsl(v.accentHue, 0.7, 0.6),
      fireHue: v.fireHue
    };
  }
}
