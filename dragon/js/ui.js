// The editor. Controls are generated from the Genome SCHEMA, so a new gene shows up here by itself.
// Everything edits the selected dragon's genome live; the dragon rebuilds its anatomy on the next frame.

import { SCHEMA, GROUPS, PRESETS, Genome } from './genome.js';
import { MAX_DRAGONS } from './world.js';
import { Store } from './store.js';
import { hsl } from './util.js';

const CSS = `
#edit-toggle{position:fixed;right:16px;bottom:16px;z-index:20;width:38px;height:38px;display:grid;place-items:center;color:var(--ui);background:var(--uiBg);border:1px solid var(--uiLine);border-radius:8px;cursor:pointer;padding:0;transition:border-color .15s,transform .15s}
#edit-toggle:hover{border-color:var(--ui)}
#edit-toggle:active{transform:scale(.96)}
#edit-toggle svg{width:16px;height:16px}
#panel{position:fixed;z-index:30;top:16px;right:16px;bottom:16px;width:min(300px,calc(100vw - 32px));display:flex;flex-direction:column;color:var(--ui);background:var(--uiBg);border:1px solid var(--uiLine);border-radius:10px;transform:translateX(calc(100% + 32px));transition:transform .28s cubic-bezier(.3,.8,.3,1);font:400 12.5px/1.4 var(--sans);-webkit-font-smoothing:antialiased}
#panel.open{transform:none}
#panel button,#panel select{font:inherit;color:inherit;cursor:pointer}
#panel button:focus-visible,#panel select:focus-visible,#panel input:focus-visible,#edit-toggle:focus-visible{outline:2px solid var(--uiAccent);outline-offset:2px}
#panel header{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px 16px}
#panel h2{margin:0;font:600 17px/1 var(--serif);letter-spacing:-.005em}
.icon{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:6px;background:none;color:var(--uiMuted);padding:0}
.icon:hover{color:var(--ui);background:var(--uiHover)}
.icon svg{width:14px;height:14px}
.scroll{overflow-y:auto;overscroll-behavior:contain;padding:0 0 16px;flex:1;-webkit-overflow-scrolling:touch}
.list{margin:0 8px 8px;display:flex;flex-direction:column}
.row{display:flex;align-items:center;gap:10px;height:34px;padding:0 8px;border:0;border-radius:6px;background:none;text-align:left;width:100%;position:relative}
.row:hover{background:var(--uiHover)}
.row[aria-selected=true]{background:var(--uiHover)}
.row[aria-selected=true]::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:1px;background:var(--uiAccent)}
.row i{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.row .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .tag{font-size:11px;color:var(--uiMuted)}
.row.add{color:var(--uiMuted)}
.row.add:hover{color:var(--ui)}
.row.add svg{width:10px;height:10px;flex:none}
.bar{display:flex;margin:0 16px 12px;border:1px solid var(--uiLine);border-radius:7px;overflow:hidden}
.bar>*{flex:1 1 auto;border:0;border-left:1px solid var(--uiLine);background:none;padding:8px 6px;font-size:12px;text-align:center;white-space:nowrap}
.bar>:first-child{border-left:0}
.bar>button:hover:not(:disabled),.bar>select:hover{background:var(--uiHover)}
.bar>button:disabled{color:var(--uiMuted);opacity:.45;cursor:default}
.bar select{appearance:none;-webkit-appearance:none;text-align:center;text-align-last:center;max-width:34%}
.bar select option{color:#222;background:#fff}
.bar .danger:hover:not(:disabled){color:var(--uiAccent)}
details{margin:0 16px;border-top:1px solid var(--uiLine)}
summary{list-style:none;cursor:pointer;padding:12px 0;font:600 12px/1 var(--sans);display:flex;justify-content:space-between;align-items:center;-webkit-user-select:none;user-select:none}
summary::-webkit-details-marker{display:none}
summary::after{content:'';width:6px;height:6px;border:solid var(--uiMuted);border-width:0 1.5px 1.5px 0;transform:rotate(45deg) translateY(-2px);transition:transform .2s}
details[open] summary::after{transform:rotate(-135deg) translate(-1px,-1px)}
.ctl{display:grid;grid-template-columns:1fr auto;gap:1px 8px;margin:0 0 10px}
.ctl label{color:var(--uiMuted)}
.ctl output{font:400 11px var(--mono);color:var(--ui);font-variant-numeric:tabular-nums;text-align:right}
input[type=range]{grid-column:1/3;width:100%;height:20px;margin:0;background:none;-webkit-appearance:none;appearance:none;cursor:pointer;--p:50%}
input[type=range]::-webkit-slider-runnable-track{height:2px;border-radius:1px;background:linear-gradient(90deg,var(--ui) var(--p),var(--uiLine) var(--p))}
input[type=range]::-moz-range-track{height:2px;border-radius:1px;background:var(--uiLine)}
input[type=range]::-moz-range-progress{height:2px;background:var(--ui)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-5px;border-radius:50%;background:var(--ui);border:0}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--ui);border:0}
.ctl.hue input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,hsl(0 65% 52%),hsl(45 70% 52%),hsl(95 55% 48%),hsl(150 55% 44%),hsl(195 60% 48%),hsl(240 60% 58%),hsl(285 55% 55%),hsl(330 62% 55%),hsl(360 65% 52%))}
.ctl.hue input[type=range]::-moz-range-track{height:6px;border-radius:3px;background:linear-gradient(90deg,hsl(0 65% 52%),hsl(45 70% 52%),hsl(95 55% 48%),hsl(150 55% 44%),hsl(195 60% 48%),hsl(240 60% 58%),hsl(285 55% 55%),hsl(330 62% 55%),hsl(360 65% 52%))}
.ctl.hue input[type=range]::-webkit-slider-thumb{margin-top:-5px;width:16px;height:16px;background:var(--sw,#fff);box-shadow:0 0 0 1px var(--ui)}
.ctl.hue input[type=range]::-moz-range-thumb{width:12px;height:12px;background:var(--sw,#fff);box-shadow:0 0 0 1px var(--ui)}
.seg{grid-column:1/3;display:flex;border:1px solid var(--uiLine);border-radius:6px;overflow:hidden;margin-top:3px}
.seg button{flex:1;border:0;border-left:1px solid var(--uiLine);background:none;padding:6px 4px;font-size:12px;color:var(--uiMuted)}
.seg button:first-child{border-left:0}
.seg button[aria-pressed=true]{background:var(--ui);color:var(--uiBg)}
.sw{display:flex;justify-content:space-between;align-items:center;padding:6px 0;cursor:pointer}
.sw input{appearance:none;-webkit-appearance:none;width:30px;height:18px;border-radius:9px;background:var(--uiLine);position:relative;margin:0;cursor:pointer;transition:background .15s}
.sw input::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--uiBg);transition:transform .15s}
.sw input:checked{background:var(--ui)}
.sw input:checked::after{transform:translateX(12px)}
.links{display:flex;gap:16px;margin:14px 16px 0;padding-top:12px;border-top:1px solid var(--uiLine)}
.link{border:0;background:none;padding:0;color:var(--uiMuted);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--uiLine)}
.link:hover{color:var(--ui)}
.scene-link{margin:2px 0 8px}
@media (max-width:640px){
  #panel{top:auto;left:8px;right:8px;bottom:8px;width:auto;height:min(56vh,500px);transform:translateY(calc(100% + 16px))}
  #edit-toggle{right:12px;bottom:12px}
  input[type=range]{height:28px}
}
@media (prefers-reduced-motion:reduce){#panel{transition:none}}
`;

const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]);
  }
  for (const c of kids) if (c) e.append(c);
  return e;
};

export class Panel {
  constructor(world) {
    this.world = world; this.controls = new Map(); this.openGroup = 'Body';
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    this.build();
    world.on((type) => { if (type === 'theme') this.theming(); if (type === 'dragons' || type === 'select' || type === 'leader') { this.tabs(); this.sync(); } });
    this.theming();
    this.saveSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => Store.save(world), 300); }; })();
  }

  theming() {
    const T = this.world.theme, r = document.documentElement.style;
    r.setProperty('--ui', T.ui); r.setProperty('--uiHover', T.uiHover); r.setProperty('--uiBg', T.uiBg); r.setProperty('--uiLine', T.uiLine); r.setProperty('--uiMuted', T.uiMuted); r.setProperty('--uiAccent', T.uiAccent);
    r.setProperty('--serif', "Fraunces, Georgia, serif"); r.setProperty('--mono', "'Plex Mono', ui-monospace, Menlo, monospace");
    r.setProperty('--sans', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif");
    this.tabs();
  }

  get d() { return this.world.selected; }

  open(v = true) {
    this.panel.classList.toggle('open', v); this.btn.setAttribute('aria-expanded', v);
    this.btn.style.display = v && matchMedia('(max-width:640px)').matches ? 'none' : '';
    this.world.showSelection = v && this.world.dragons.length > 1;
    if (v) this.sync();
  }

  build() {
    const w = this.world;
    const ICON = {
      sliders: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 5h7M13 5h1M2 11h1M7 11h7"/><circle cx="11" cy="5" r="1.7"/><circle cx="5" cy="11" r="1.7"/></svg>',
      close: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>',
      plus: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M5 1v8M1 5h8"/></svg>'
    };
    this.ICON = ICON;
    this.btn = el('button', { id: 'edit-toggle', title: 'Edit dragons', 'aria-label': 'Edit dragons', 'aria-expanded': 'false', 'aria-controls': 'panel', onclick: () => this.open(!this.panel.classList.contains('open')) });
    this.btn.innerHTML = ICON.sliders;
    this.panel = el('aside', { id: 'panel', 'aria-label': 'Dragon editor' });
    const close = el('button', { class: 'icon', 'aria-label': 'Close', onclick: () => this.open(false) }); close.innerHTML = ICON.close;
    const head = el('header', {}, el('h2', { text: 'Dragons' }), close);
    this.listEl = el('div', { class: 'list', role: 'listbox', 'aria-label': 'Dragons' });
    this.presetSel = el('select', { 'aria-label': 'Apply a preset', onchange: e => { const n = e.target.value; if (!n) return; this.apply(Genome.preset(n).v); e.target.value = ''; } },
      el('option', { value: '', text: 'Preset' }), ...Object.keys(PRESETS).map(n => el('option', { value: n, text: n })));
    this.shapeBar = el('div', { class: 'bar', role: 'group', 'aria-label': 'Reshape this dragon' });
    this.shapeBar.append(this.presetSel,
      this.mk('Random', () => this.apply(Genome.random().v)),
      this.mk('Mutate', () => this.apply(this.d.genome.mutate(0.18).v)),
      this.mk('Reset', () => this.apply(Genome.preset('Ember').v)));
    this.herdBar = el('div', { class: 'bar', role: 'group', 'aria-label': 'Herd' });
    this.herdBar.append(
      this.mk('Clone', () => this.add(this.d.genome.mutate(0.06)), 'clone'),
      this.mk('Breed', () => this.breed(), 'breed'),
      this.mk('Lead', () => w.setLeader(this.d), 'lead'),
      this.mk('Remove', () => { w.removeDragon(this.d); this.saveSoon(); }, 'remove', 'danger'));
    const scroll = el('div', { class: 'scroll' }, this.listEl, this.shapeBar, this.herdBar);
    // genome controls
    this.groupsEl = el('div');
    for (const grp of GROUPS) {
      const det = el('details', { open: grp === this.openGroup ? '' : null }, el('summary', { text: grp }));
      det.addEventListener('toggle', () => { if (det.open) this.openGroup = grp; });
      for (const s of SCHEMA.filter(s => s.group === grp)) det.append(this.control(s));
      this.groupsEl.append(det);
    }
    scroll.append(this.groupsEl, this.scene(), this.footer());
    this.panel.append(head, scroll);
    document.body.append(this.btn, this.panel);
    this.tabs();
  }

  mk(text, fn, id, cls = '') { const b = el('button', { class: cls, type: 'button', text, onclick: fn }); if (id) b.dataset.id = id; return b; }

  control(s) {
    const wrap = el('div', { class: 'ctl' + (s.type === 'hue' ? ' hue' : '') });
    const id = 'g-' + s.key;
    const out = el('output', { for: id });
    wrap.append(el('label', { for: id, text: s.label }), out);
    if (s.type === 'select') {
      const seg = el('div', { class: 'seg', role: 'group', 'aria-label': s.label });
      for (const [val, label] of s.options) seg.append(el('button', { text: label, 'aria-pressed': 'false', 'data-v': val, onclick: () => this.set(s.key, val) }));
      out.textContent = '';
      wrap.append(seg);
      this.controls.set(s.key, { s, seg, out });
    } else {
      const inp = el('input', { type: 'range', id, min: s.min, max: s.max, step: s.step, value: s.def });
      inp.addEventListener('input', () => { this.fill(inp); this.set(s.key, +inp.value); });
      inp.addEventListener('dblclick', () => this.set(s.key, s.def));
      wrap.append(inp);
      if (s.hint) wrap.title = s.hint;
      this.controls.set(s.key, { s, inp, out });
    }
    return wrap;
  }

  fill(inp) { inp.style.setProperty('--p', ((+inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); }

  scene() {
    const w = this.world, box = el('details', { open: '' }, el('summary', { text: 'Scene' }));
    const sw = (label, get, set) => { const i = el('input', { type: 'checkbox', role: 'switch' }); i.checked = get(); i.addEventListener('change', () => set(i.checked)); return el('label', { class: 'sw' }, el('span', { text: label }), i); };
    box.append(
      sw('Flock together', () => w.flocking, v => { w.flocking = v; }),
      sw('Paper burns', () => w.paperOn, v => { w.paperOn = v; }),
      sw('Sound', () => !w.sound.muted, v => { w.sound.unlock(); w.sound.setMuted(!v); if (v) w.sound.blip(true); }));
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' });
    for (const m of ['auto', 'light', 'dark']) {
      seg.append(el('button', { type: 'button', text: m[0].toUpperCase() + m.slice(1), 'aria-pressed': String(w.themeMode === m), onclick: () => { w.setThemeMode(m); [...seg.children].forEach(c => c.setAttribute('aria-pressed', String(c.textContent.toLowerCase() === m))); } }));
    }
    box.append(el('div', { class: 'ctl', style: 'margin-top:6px' }, el('label', { text: 'Theme' }), el('span'), seg));
    const restore = el('button', { class: 'link scene-link', type: 'button', text: 'Restore the page', onclick: () => w.restorePage() });
    box.append(restore);
    return box;
  }

  footer() {
    this.shareBtn = el('button', { class: 'link', type: 'button', text: 'Copy share link', onclick: async () => {
      const url = Store.url(this.world);
      history.replaceState(null, '', url.slice(location.origin.length));
      try { await navigator.clipboard.writeText(url); this.shareBtn.textContent = 'Copied'; } catch (_) { this.shareBtn.textContent = 'Link is in the address bar'; }
      setTimeout(() => { this.shareBtn.textContent = 'Copy share link'; }, 1800);
    } });
    const forget = el('button', { class: 'link', type: 'button', text: 'Forget saved', onclick: () => { Store.clear(); forget.textContent = 'Cleared'; setTimeout(() => { forget.textContent = 'Forget saved'; }, 1500); } });
    return el('div', { class: 'links' }, this.shareBtn, forget);
  }

  // ---------------------------------------------------------------- actions
  set(key, val) { this.d.genome.set(key, val); this.sync(key); this.saveSoon(); }
  apply(values) { this.d.genome.patch(values); this.sync(); this.saveSoon(); }
  add(g) {
    const d = this.world.addDragon(g); if (!d) return;
    this.saveSoon();
  }
  breed() {
    const ds = this.world.dragons; if (ds.length < 2) return;
    const a = this.d, b = ds.find(x => x !== a && x === ds[(ds.indexOf(a) + 1) % ds.length]) || ds[0];
    this.add(Genome.cross(a.genome, b.genome));
  }

  tabs() {
    const w = this.world; if (!this.listEl) return;
    this.listEl.replaceChildren();
    for (const d of w.dragons) {
      const pal = d.genome.palette(w.theme.dark), sel = d === w.selected;
      this.listEl.append(el('button', { class: 'row', role: 'option', 'aria-selected': String(sel), onclick: () => w.select(d) },
        el('i', { style: `background:${pal.skin}` }), el('span', { class: 'nm', text: d.name }),
        d === w.leader && w.dragons.length > 1 ? el('span', { class: 'tag', text: 'Leader' }) : null));
    }
    const n = w.dragons.length, add = el('button', { class: 'row add', type: 'button', disabled: n >= MAX_DRAGONS ? '' : null, onclick: () => this.add(Genome.random()) });
    add.innerHTML = this.ICON.plus + '<span class="nm">Add dragon</span>';
    this.listEl.append(add);
    if (this.herdBar) {
      const q = id => this.herdBar.querySelector(`[data-id=${id}]`);
      q('remove').disabled = n <= 1; q('lead').disabled = n <= 1 || w.selected === w.leader;
      q('breed').disabled = n < 2 || n >= MAX_DRAGONS; q('clone').disabled = n >= MAX_DRAGONS;
    }
  }

  /** Reflect the selected genome in every control. */
  sync(only) {
    const v = this.d.genome.v, dark = this.world.theme.dark;
    for (const [key, c] of this.controls) {
      if (only && key !== only && c.s.type !== 'hue') continue;
      const val = v[key], s = c.s;
      if (s.type === 'select') { for (const b of c.seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === val)); continue; }
      if (+c.inp.value !== val) c.inp.value = val;
      this.fill(c.inp);
      c.out.textContent = s.int ? String(val) : s.type === 'hue' ? Math.round(val) + '°' : (+val).toFixed(2);
      if (s.type === 'hue') c.inp.style.setProperty('--sw', hsl(val, 0.7, 0.5));
    }
  }
}
