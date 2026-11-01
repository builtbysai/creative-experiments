// Persistence and sharing. A herd is stored in localStorage and in the URL hash, so a link recreates it exactly.
import { Genome } from './genome.js';

const KEY = 'draco.v2';

export const Store = {
  /** @returns {Genome[]|null} the herd from the URL hash, or from localStorage */
  load() {
    const m = /[#&]d=([^&]+)/.exec(location.hash);
    if (m) {
      const gs = m[1].split('~').map(s => Genome.decode(s)).filter(Boolean);
      if (gs.length) return gs;
    }
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && Array.isArray(o.dragons) && o.dragons.length) return o.dragons.map(g => Genome.fromJSON(g));
    } catch (_) {}
    return null;
  },
  save(world) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 2, dragons: world.dragons.map(d => d.genome.toJSON()) })); } catch (_) {}
  },
  url(world) {
    return location.origin + location.pathname + '#d=' + world.dragons.map(d => d.genome.encode()).join('~');
  },
  clear() { try { localStorage.removeItem(KEY); } catch (_) {} }
};
