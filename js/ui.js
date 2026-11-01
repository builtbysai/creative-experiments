// The HUD, in two parts.
//
//   Dock    always visible, bottom centre: one chip per dragon (tap to select, + to add) and icon toggles for the
//           scene (new look, flock, fire on paper, sound, theme, mend the page, open the editor).
//   Editor  a side card (a bottom sheet on phones) for the selected dragon: preset swatches, one tab per gene
//           group with its sliders, and the herd actions.
//
// Controls are generated from the Genome SCHEMA, so a new gene shows up here by itself.

import { SCHEMA, GROUPS, PRESETS, Genome } from './genome.js';
import { MAX_DRAGONS } from './world.js';
import { Store } from './store.js';
import { hsl } from './util.js';

const I = {
  dice: '<path d="M3 3h10v10H3z"/><circle cx="6" cy="6" r=".6" fill="currentColor"/><circle cx="10" cy="10" r=".6" fill="currentColor"/><circle cx="10" cy="6" r=".6" fill="currentColor"/><circle cx="6" cy="10" r=".6" fill="currentColor"/>',
  sliders: '<path d="M2 5h7M13 5h1M2 11h1M7 11h7"/><circle cx="11" cy="5" r="1.7"/><circle cx="5" cy="11" r="1.7"/>',
  flock: '<path d="M8 3l3 5H5zM4 9l3 4H1zM12 9l3 4H9z"/>',
  flame: '<path d="M8 14c-2.6 0-4-1.7-4-3.8 0-2 1.6-3 2.2-5 1.2.9 1.6 2 1.6 3 .6-.5 1-1.4 1-2.4 1.6 1.3 3.2 2.6 3.2 4.4 0 2-1.4 3.8-4 3.8z"/>',
  sound: '<path d="M2.5 6.5h2.2L8 3.5v9L4.7 9.5H2.5z"/><path d="M10.5 6a3 3 0 0 1 0 4M12.3 4.3a5.5 5.5 0 0 1 0 7.4"/>',
  mute: '<path d="M2.5 6.5h2.2L8 3.5v9L4.7 9.5H2.5z"/><path d="M11 6.5l3 3M14 6.5l-3 3"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
  moon: '<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"/>',
  restore: '<path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v3h3"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  scene: '<path d="M1.5 13.5l4.2-6.5 2.8 4 2-2.8 4 5.3z"/><circle cx="11.5" cy="4" r="1.6"/>',
  crown: '<path d="M2.5 11.5l-.5-6 3.2 2.5L8 4l2.8 4 3.2-2.5-.5 6z"/>'
};
const icon = n => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

const CSS = `
.hud{--r:12px;font:400 13px/1.4 var(--sans);color:var(--ui);-webkit-font-smoothing:antialiased}
.hud button,.hud select{font:inherit;color:inherit;cursor:pointer}
.hud :focus-visible{outline:2px solid var(--uiAccent);outline-offset:2px}
#dock{position:fixed;z-index:30;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px;background:var(--uiBg);border:1px solid var(--uiLine);border-radius:16px;box-shadow:0 6px 24px rgba(30,15,0,.14);max-width:calc(100vw - 16px)}
#dock .sep{width:1px;align-self:stretch;margin:4px 2px;background:var(--uiLine)}
.herd{display:flex;gap:2px;align-items:center}
.chip{position:relative;width:34px;height:34px;display:grid;place-items:center;border:0;background:none;border-radius:50%;padding:0}
.chip i{width:20px;height:20px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.22);transition:transform .15s}
.chip:hover i{transform:scale(1.12)}
.chip[aria-pressed=true]{box-shadow:0 0 0 2px var(--uiBg),0 0 0 3.5px var(--ui)}
.chip .lead{position:absolute;right:-1px;top:-1px;width:12px;height:12px;display:grid;place-items:center;border-radius:50%;background:var(--ui);color:var(--uiBg)}
.chip .lead svg{width:8px;height:8px;stroke-width:1.8}
.tally{position:fixed;z-index:20;left:16px;top:16px;display:flex;align-items:center;gap:7px;padding:7px 11px 7px 9px;background:var(--uiBg);border:1px solid var(--uiLine);border-radius:999px;font:500 12px/1 var(--sans);color:var(--ui);opacity:0;transform:translateY(-6px);transition:opacity .3s,transform .3s;pointer-events:none}
.tally.on{opacity:1;transform:none}
.tally svg{width:13px;height:13px;color:var(--uiAccent)}
.tally b{font:500 12px var(--mono);font-variant-numeric:tabular-nums}
.tally.pop b{animation:pop .25s}
@keyframes pop{50%{transform:scale(1.35)}}
.tool{width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:10px;background:none;color:var(--uiMuted);padding:0;position:relative;transition:background .12s,color .12s,transform .12s}
.tool svg{width:18px;height:18px}
.tool:hover:not(:disabled){background:var(--uiHover);color:var(--ui)}
.tool:active:not(:disabled){transform:scale(.92)}
.tool[aria-pressed=true]{color:var(--ui);background:var(--uiHover)}
.tool.accent[aria-pressed=true]{background:var(--ui);color:var(--uiBg)}
.tool:disabled{opacity:.35;cursor:default}
.hud [data-tip]:hover::after,.hud [data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);white-space:nowrap;background:var(--ui);color:var(--uiBg);font:500 11.5px/1 var(--sans);padding:6px 8px;border-radius:6px;pointer-events:none}
#scenes{position:fixed;z-index:31;left:50%;bottom:78px;width:min(318px,calc(100vw - 24px));box-sizing:border-box;padding:12px;background:var(--uiBg);border:1px solid var(--uiLine);border-radius:14px;box-shadow:0 10px 36px rgba(30,15,0,.18);transform:translate(-50%,8px);opacity:0;visibility:hidden;transition:transform .22s cubic-bezier(.3,.8,.3,1),opacity .15s,visibility 0s .22s}
#scenes.open{transform:translate(-50%,0);opacity:1;visibility:visible;transition:transform .22s cubic-bezier(.3,.8,.3,1),opacity .15s}
#scenes h3{margin:0 0 9px 2px;font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--uiMuted)}
.scn{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.scn button{border:1px solid var(--uiLine);background:none;border-radius:10px;padding:5px 5px 8px;display:flex;flex-direction:column;gap:6px;align-items:stretch;color:var(--uiMuted);font-weight:500;transition:border-color .12s,color .12s,transform .12s}
.scn button:hover{color:var(--ui);border-color:var(--ui)}
.scn button:active{transform:scale(.97)}
.scn button[aria-pressed=true]{border-color:var(--ui);color:var(--ui);box-shadow:inset 0 0 0 1px var(--ui)}
.scn i{display:block;height:46px;border-radius:7px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}
.scn i.paper{background:repeating-linear-gradient(0deg,transparent 0 9px,rgba(90,70,50,.22) 9px 10px),linear-gradient(135deg,#f3ead6,#e3d5b6)}
.scn i.garden{background:radial-gradient(circle at 28% 62%,#ff6f8f 0 3px,transparent 4px),radial-gradient(circle at 68% 40%,#ffd23f 0 3px,transparent 4px),repeating-linear-gradient(100deg,#4c8a34 0 2px,#68a64a 2px 4px),#5da042}
.scn i.weather{background:repeating-linear-gradient(75deg,transparent 0 7px,rgba(255,255,255,.55) 7px 8px),linear-gradient(180deg,#6f8197,#9db0c2)}
#scenes .wx{margin-top:10px;display:none}
#scenes .wx.on{display:block}
#scenes .wx small{display:block;margin:0 0 6px 2px;font:600 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--uiMuted)}
#scenes .seg{grid-column:auto}
@media (hover:none){.hud [data-tip]::after{display:none!important}}

#editor{position:fixed;z-index:29;top:16px;right:16px;bottom:16px;width:min(320px,calc(100vw - 32px));display:flex;flex-direction:column;background:var(--uiBg);border:1px solid var(--uiLine);border-radius:var(--r);box-shadow:0 10px 40px rgba(30,15,0,.16);transform:translateX(calc(100% + 40px));opacity:0;visibility:hidden;transition:transform .3s cubic-bezier(.3,.8,.3,1),opacity .2s,visibility 0s .3s}
#editor.open{transform:none;opacity:1;visibility:visible;transition:transform .3s cubic-bezier(.3,.8,.3,1),opacity .2s}
#editor header{display:flex;align-items:center;gap:10px;padding:14px 12px 4px 16px}
#editor h2{margin:0;flex:1;font:600 18px/1.1 var(--serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#editor h2 small{display:block;margin-top:3px;font:400 11.5px/1 var(--sans);color:var(--uiMuted)}
.sw-row{display:flex;gap:7px;padding:10px 16px 4px;flex-wrap:wrap}
.swatch{width:24px;height:24px;border-radius:50%;border:0;padding:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2);position:relative;transition:transform .12s}
.swatch:hover{transform:scale(1.15)}
.tabs{display:flex;flex-wrap:wrap;gap:0 2px;padding:6px 10px 0;border-bottom:1px solid var(--uiLine)}
.tabs button{border:0;background:none;padding:7px 7px 9px;color:var(--uiMuted);font-weight:500;position:relative}
.tabs button:hover{color:var(--ui)}
.tabs button[aria-selected=true]{color:var(--ui)}
.tabs button[aria-selected=true]::after{content:'';position:absolute;left:7px;right:7px;bottom:-1px;height:2px;border-radius:1px;background:var(--uiAccent)}
.pane{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px 8px;-webkit-overflow-scrolling:touch}
.ctl{display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin:0 0 14px}
.ctl label{color:var(--uiMuted)}
.ctl output{font:400 12px var(--mono);color:var(--ui);font-variant-numeric:tabular-nums}
input[type=range]{grid-column:1/3;width:100%;height:22px;margin:0;background:none;-webkit-appearance:none;appearance:none;cursor:pointer;--p:50%}
input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:linear-gradient(90deg,var(--ui) var(--p),var(--uiLine) var(--p))}
input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:var(--uiLine)}
input[type=range]::-moz-range-progress{height:3px;border-radius:2px;background:var(--ui)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-6.5px;border-radius:50%;background:var(--uiBg);border:2px solid var(--ui);transition:transform .12s}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--uiBg);border:2px solid var(--ui)}
input[type=range]:active::-webkit-slider-thumb{transform:scale(1.2)}
.ctl.hue input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:4px;background:linear-gradient(90deg,hsl(0 65% 52%),hsl(45 70% 52%),hsl(95 55% 48%),hsl(150 55% 44%),hsl(195 60% 48%),hsl(240 60% 58%),hsl(285 55% 55%),hsl(330 62% 55%),hsl(360 65% 52%))}
.ctl.hue input[type=range]::-moz-range-track{height:8px;border-radius:4px;background:linear-gradient(90deg,hsl(0 65% 52%),hsl(45 70% 52%),hsl(95 55% 48%),hsl(150 55% 44%),hsl(195 60% 48%),hsl(240 60% 58%),hsl(285 55% 55%),hsl(330 62% 55%),hsl(360 65% 52%))}
.ctl.hue input[type=range]::-webkit-slider-thumb{margin-top:-5px;background:var(--sw,#fff)}
.ctl.hue input[type=range]::-moz-range-thumb{background:var(--sw,#fff)}
.seg{grid-column:1/3;display:flex;gap:4px}
.seg button{flex:1;border:1px solid var(--uiLine);background:none;border-radius:8px;padding:7px 4px;color:var(--uiMuted)}
.seg button:hover{color:var(--ui);border-color:var(--ui)}
.seg button[aria-pressed=true]{background:var(--ui);border-color:var(--ui);color:var(--uiBg)}
#editor footer{display:flex;gap:4px;padding:8px 10px 10px;border-top:1px solid var(--uiLine)}
.act{flex:1;border:0;background:none;border-radius:8px;padding:8px 2px;color:var(--uiMuted);font-size:12px;font-weight:500}
.act:hover:not(:disabled){background:var(--uiHover);color:var(--ui)}
.act.danger:hover:not(:disabled){color:var(--uiAccent)}
.act:disabled{opacity:.35;cursor:default}

@media (max-width:640px){
  #dock{bottom:10px;gap:2px;padding:5px;flex-wrap:wrap;justify-content:center;width:max-content}
  #dock .sep{display:none}
  .herd{flex-basis:100%;justify-content:center;margin-bottom:2px}
  #scenes{bottom:118px}
  .chip{width:32px;height:32px}.tool{width:34px;height:34px}
  #editor{top:auto;left:8px;right:8px;bottom:70px;width:auto;height:min(54vh,460px);transform:translateY(calc(100% + 90px))}
  input[type=range]{height:30px}
}
@media (prefers-reduced-motion:reduce){#editor,.tool,.chip i{transition:none}}
`;

const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) e.append(c);
  return e;
};

export class Panel {
  constructor(world) {
    this.world = world; this.controls = new Map(); this.group = GROUPS[0]; this.tools = {};
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    this.build();
    world.on(type => {
      if (type === 'theme') this.theming();
      if (type === 'scene' && this.scnRow) this.scenery();
      if (type === 'frame') this.count();
      if (type === 'dragons' || type === 'select' || type === 'leader') { this.dock(); this.head(); this.sync(); }
    });
    this.tally = el('div', { class: 'tally hud', 'aria-live': 'polite', html: icon('flame') + '<span>Burnt</span><b>0</b>' });
    document.body.append(this.tally); this.lastTally = 0;
    this.theming(); this.scenery();
    this.saveSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => Store.save(world), 300); }; })();
  }

  /** The burn tally: words (or garden flowers) set alight. Appears with the first one. */
  count() {
    const n = this.world.stats.words;
    if (n === this.lastTally) return;
    this.lastTally = n; this.tally.classList.toggle('on', n > 0);
    const b = this.tally.querySelector('b'); b.textContent = n;
    this.tally.classList.remove('pop'); void this.tally.offsetWidth; this.tally.classList.add('pop');
  }

  get d() { return this.world.selected; }
  get isOpen() { return this.editor.classList.contains('open'); }

  theming() {
    const T = this.world.theme, r = document.documentElement.style;
    for (const k of ['ui', 'uiBg', 'uiHover', 'uiLine', 'uiMuted', 'uiAccent']) r.setProperty('--' + k, T[k]);
    r.setProperty('--serif', 'Fraunces, Georgia, serif'); r.setProperty('--mono', "'Plex Mono', ui-monospace, Menlo, monospace");
    r.setProperty('--sans', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif");
    if (this.dockEl) { this.dock(); this.swatches(); this.tools.theme.innerHTML = icon(T.dark ? 'moon' : 'sun'); }
  }

  open(v = true) {
    this.editor.classList.toggle('open', v);
    this.tools.edit.setAttribute('aria-pressed', String(v));
    this.world.showSelection = v && this.world.dragons.length > 1;
    if (v) this.sync();
  }

  menu(v) { this.menuEl.classList.toggle('open', v); this.tools.scene.setAttribute('aria-pressed', String(v || this.world.sceneName !== 'paper')); }

  /** Reflect the chosen background in the picker and the tools that only make sense on paper. */
  scenery() {
    const w = this.world, s = w.sceneName;
    for (const b of this.scnRow.children) b.setAttribute('aria-pressed', String(b.dataset.s === s));
    for (const b of this.wxRow.children) b.setAttribute('aria-pressed', String(b.dataset.w === w.weatherMode));
    this.menuEl.querySelector('.wx').classList.toggle('on', s === 'weather');
    this.tools.scene.setAttribute('aria-pressed', String(s !== 'paper' || this.menuEl.classList.contains('open')));
    this.tools.paper.disabled = s !== 'paper';
    const tip = s === 'garden' ? 'Regrow the garden' : s === 'weather' ? 'Clear the scorch' : 'Mend the page';
    this.tools.restore.dataset.tip = tip; this.tools.restore.setAttribute('aria-label', tip);
    this.tally.querySelector('span').textContent = s === 'garden' ? 'Flowers burnt' : 'Burnt';
  }

  // ---------------------------------------------------------------- build
  build() {
    const w = this.world;
    this.herdEl = el('div', { class: 'herd', role: 'group', 'aria-label': 'Dragons' });
    this.dockEl = el('div', { id: 'dock', class: 'hud', role: 'toolbar', 'aria-label': 'Scene' }, this.herdEl, el('span', { class: 'sep' }));
    const tool = (key, ico, tip, fn, cls = '') => {
      const b = el('button', { class: 'tool ' + cls, type: 'button', 'data-tip': tip, 'aria-label': tip, html: icon(ico), onclick: fn });
      this.tools[key] = b; this.dockEl.append(b); return b;
    };
    const toggle = (key, ico, tip, get, set, cls) => {
      const b = tool(key, ico, tip, () => { set(!get()); b.setAttribute('aria-pressed', String(get())); }, cls);
      b.setAttribute('aria-pressed', String(get())); return b;
    };
    tool('shuffle', 'dice', 'New look', () => this.shuffle());
    toggle('flock', 'flock', 'Flock together', () => w.flocking, v => { w.flocking = v; });
    tool('scene', 'scene', 'Background', () => this.menu(!this.menuEl.classList.contains('open')));
    toggle('paper', 'flame', 'Fire burns the page', () => w.paperOn, v => { w.paperOn = v; });
    const snd = toggle('sound', 'sound', 'Sound', () => !w.sound.muted, v => { w.sound.unlock(); w.sound.setMuted(!v); snd.innerHTML = icon(v ? 'sound' : 'mute'); if (v) w.sound.blip(true); });
    snd.innerHTML = icon(w.sound.muted ? 'mute' : 'sound');
    tool('theme', 'sun', 'Light or dark', () => w.setThemeMode(w.theme.dark ? 'light' : 'dark'));
    tool('restore', 'restore', 'Mend the page', () => w.restorePage());
    this.dockEl.append(el('span', { class: 'sep' }));
    tool('edit', 'sliders', 'Edit dragon', () => this.open(!this.isOpen), 'accent').setAttribute('aria-pressed', 'false');

    // editor
    this.title = el('h2');
    const close = el('button', { class: 'tool', type: 'button', 'aria-label': 'Close editor', html: icon('close'), onclick: () => this.open(false) });
    this.swEl = el('div', { class: 'sw-row', role: 'group', 'aria-label': 'Presets' });
    this.tabsEl = el('div', { class: 'tabs', role: 'tablist' });
    this.pane = el('div', { class: 'pane', role: 'tabpanel' });
    this.panes = {};
    for (const grp of GROUPS) {
      const p = el('div', { hidden: true });
      for (const s of SCHEMA.filter(s => s.group === grp)) p.append(this.control(s));
      this.panes[grp] = p; this.pane.append(p);
      this.tabsEl.append(el('button', { type: 'button', role: 'tab', text: grp, 'data-g': grp, onclick: () => this.tab(grp) }));
    }
    const act = (text, fn, id, cls = '') => el('button', { class: 'act ' + cls, type: 'button', text, 'data-id': id, onclick: fn });
    this.foot = el('footer', {},
      act('Mutate', () => this.apply(this.d.genome.mutate(0.18).v), 'mutate'),
      act('Clone', () => this.add(this.d.genome.mutate(0.06)), 'clone'),
      act('Breed', () => this.breed(), 'breed'),
      act('Lead', () => w.setLeader(this.d), 'lead'),
      act('Share', () => this.share(), 'share'),
      act('Remove', () => { w.removeDragon(this.d); this.saveSoon(); }, 'remove', 'danger'));
    this.editor = el('aside', { id: 'editor', class: 'hud', 'aria-label': 'Dragon editor' },
      el('header', {}, this.title, close), this.swEl, this.tabsEl, this.pane, this.foot);
    // background picker: a small card above the dock
    this.scnRow = el('div', { class: 'scn', role: 'group', 'aria-label': 'Background' });
    for (const [id, label] of [['paper', 'Paper'], ['garden', 'Garden'], ['weather', 'Weather']]) this.scnRow.append(el('button', { type: 'button', 'data-s': id, 'aria-pressed': 'false', onclick: () => w.setScene(id) }, el('i', { class: id }), label));
    this.wxRow = el('div', { class: 'seg', role: 'group', 'aria-label': 'Weather' });
    for (const [id, label] of [['rain', 'Rain'], ['wind', 'Wind'], ['fog', 'Fog']]) this.wxRow.append(el('button', { type: 'button', 'data-w': id, 'aria-pressed': 'false', text: label, onclick: () => w.setWeather(id) }));
    this.menuEl = el('div', { id: 'scenes', class: 'hud', role: 'dialog', 'aria-label': 'Background' }, el('h3', { text: 'Background' }), this.scnRow, el('div', { class: 'wx' }, el('small', { text: 'Weather' }), this.wxRow));
    document.addEventListener('pointerdown', e => { if (this.menuEl.classList.contains('open') && !this.menuEl.contains(e.target) && !this.tools.scene.contains(e.target)) this.menu(false); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') this.menu(false); });
    document.body.append(this.dockEl, this.editor, this.menuEl);
    this.swatches(); this.tab(this.group); this.dock(); this.head();
  }

  control(s) {
    const wrap = el('div', { class: 'ctl' + (s.type === 'hue' ? ' hue' : ''), title: s.hint || null });
    const id = 'g-' + s.key, out = el('output', { for: id });
    wrap.append(el('label', { for: id, text: s.label }), out);
    if (s.type === 'select') {
      const seg = el('div', { class: 'seg', role: 'group', 'aria-label': s.label });
      for (const [val, label] of s.options) seg.append(el('button', { type: 'button', text: label, 'aria-pressed': 'false', 'data-v': val, onclick: () => this.set(s.key, val) }));
      wrap.append(seg); this.controls.set(s.key, { s, seg, out });
    } else {
      const inp = el('input', { type: 'range', id, min: s.min, max: s.max, step: s.step, value: s.def });
      inp.addEventListener('input', () => { this.fill(inp); this.set(s.key, +inp.value); });
      inp.addEventListener('dblclick', () => { inp.value = s.def; this.fill(inp); this.set(s.key, s.def); });
      wrap.append(inp); this.controls.set(s.key, { s, inp, out });
    }
    return wrap;
  }

  fill(inp) { inp.style.setProperty('--p', ((+inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); }

  tab(grp) {
    this.group = grp;
    for (const g in this.panes) this.panes[g].hidden = g !== grp;
    for (const b of this.tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.g === grp));
    this.pane.scrollTop = 0;
  }

  swatches() {
    if (!this.swEl) return;
    this.swEl.replaceChildren();
    const dark = this.world.theme.dark;
    for (const n of Object.keys(PRESETS)) {
      const pal = Genome.preset(n).palette(dark);
      this.swEl.append(el('button', { class: 'swatch', type: 'button', title: n, 'aria-label': 'Preset ' + n, style: `background:linear-gradient(135deg,${pal.skin} 55%,${pal.spike} 55%)`, onclick: () => this.apply(Genome.preset(n).v) }));
    }
  }

  // ---------------------------------------------------------------- state -> view
  dock() {
    const w = this.world, n = w.dragons.length, dark = w.theme.dark;
    this.herdEl.replaceChildren();
    for (const d of w.dragons) {
      const pal = d.genome.palette(dark), sel = d === w.selected;
      this.herdEl.append(el('button', { class: 'chip', type: 'button', 'data-tip': d.name, 'aria-label': d.name, 'aria-pressed': String(sel), onclick: () => { w.select(d); } },
        el('i', { style: `background:linear-gradient(135deg,${pal.skin} 55%,${pal.spike} 55%)` }),
        n > 1 && d === w.leader ? el('span', { class: 'lead', html: icon('crown') }) : null));
    }
    this.herdEl.append(el('button', { class: 'tool', type: 'button', 'data-tip': n >= MAX_DRAGONS ? 'Herd is full' : 'Add a dragon', 'aria-label': 'Add a dragon', html: icon('plus'), disabled: n >= MAX_DRAGONS, onclick: () => this.add(Genome.random()) }));
  }

  head() {
    const w = this.world, d = this.d; if (!d || !this.title) return;
    this.title.textContent = d.name;
    if (w.dragons.length > 1) this.title.append(el('small', { text: d === w.leader ? 'Leads the herd' : 'Follows the leader' }));
    const n = w.dragons.length, q = id => this.foot.querySelector(`[data-id=${id}]`);
    q('remove').disabled = n <= 1; q('lead').disabled = n <= 1 || d === w.leader;
    q('breed').disabled = n < 2 || n >= MAX_DRAGONS; q('clone').disabled = n >= MAX_DRAGONS;
  }

  /** Reflect the selected genome in every control. */
  sync(only) {
    const v = this.d.genome.v;
    for (const [key, c] of this.controls) {
      if (only && key !== only && c.s.type !== 'hue') continue;
      const val = v[key], s = c.s;
      if (s.type === 'select') { for (const b of c.seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === val)); continue; }
      if (+c.inp.value !== val) c.inp.value = val;
      this.fill(c.inp);
      c.out.textContent = s.int ? String(val) : s.type === 'hue' ? Math.round(val) + '°' : (+val).toFixed(2);
      if (s.type === 'hue') c.inp.style.setProperty('--sw', hsl(val, 0.7, 0.5));
    }
    this.dock();
  }

  // ---------------------------------------------------------------- actions
  set(key, val) { this.d.genome.set(key, val); this.sync(key); this.saveSoon(); }
  apply(values) { this.d.genome.patch(values); this.sync(); this.saveSoon(); }
  add(g) { if (this.world.addDragon(g)) this.saveSoon(); }
  breed() {
    const ds = this.world.dragons; if (ds.length < 2) return;
    const a = this.d, b = ds[(ds.indexOf(a) + 1) % ds.length];
    this.add(Genome.cross(a.genome, b.genome));
  }
  /** A fresh random look, with a shake of the head to show off. */
  shuffle() {
    this.apply(Genome.random().v);
    this.d.brain.setAction('shake'); this.world.sound.blip(true);
  }
  async share() {
    const url = Store.url(this.world), b = this.foot.querySelector('[data-id=share]');
    history.replaceState(null, '', url.slice(location.origin.length));
    try { await navigator.clipboard.writeText(url); b.textContent = 'Copied'; } catch (_) { b.textContent = 'In address bar'; }
    setTimeout(() => { b.textContent = 'Share'; }, 1600);
  }
}
