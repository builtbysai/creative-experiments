// Entry point: build the world, restore the saved herd (or the URL's), wait for fonts, start.
import { World } from './world.js';
import { Genome } from './genome.js';
import { Panel } from './ui.js';
import { Store } from './store.js';

const cv = document.getElementById('c');
const world = new World(cv);
const herd = Store.load() || [new Genome()];
world.resize();
world.setScene(world.initial.scene, false);
if (world.initial.weather) world.setWeather(world.initial.weather);
herd.slice(0, 6).forEach((g, i) => world.addDragon(g, { name: i === 0 ? 'Draco' : `Draco ${i + 1}` }));
const panel = new Panel(world);

Promise.all(['400 18px Fraunces', '600 18px Fraunces', '400 12px "Plex Mono"'].map(f => document.fonts.load(f).catch(() => {})))
  .then(() => { world.page.fit(world.W, world.H, world.g); world.buildPaperBitmap(); });
world.start();

// hooks for tests and screenshots
window.__world = world;
window.__panel = panel;
import('./genome.js').then(m => { window.__presets = m.PRESETS; });
window.__dragon = {
  step(sec, hz = 60) { const n = Math.round(sec * hz); for (let i = 0; i < n; i++) world.update(1 / hz); world.draw(); },
  pause() { world.pause(); }, resume() { world.resume(); },
  pointer(x, y, down) { const p = world.pointer; p.x = x; p.y = y; p.inside = true; p.seen = true; p.lastMove = world.time; p.mouseDown = !!down; },
  release() { world.pointer.mouseDown = false; world.pointer.inside = false; },
  state() {
    const d = world.dragons[0];
    return {
      x: d.x, y: d.y, h: d.h, v: d.v, breath: d.breath, wing: d.wing, steps: d.steps, action: d.brain.actionName, energy: d.brain.energy,
      count: world.dragons.length, parts: world.particles.list.length, W: world.W, H: world.H, L: d.L,
      paper: { ...world.paper.stats, act: world.paper.nAct }, burning: world.page.burning,
      legs: d.legs.map(l => ({ sw: !!l.sw, lift: l.lift, curl: l.curl, spread: l.spread, ex: l.ex, ey: l.ey, ax: l.ax, ay: l.ay, pair: l.pair }))
    };
  }
};
