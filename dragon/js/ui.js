// The editor. Controls are generated from the Genome SCHEMA, so a new gene shows up here by itself.
// Everything edits the selected dragon's genome live; the dragon rebuilds its anatomy on the next frame.

import { SCHEMA, GROUPS, PRESETS, Genome } from './genome.js';
import { MAX_DRAGONS } from './world.js';
import { Store } from './store.js';
import { hsl } from './util.js';

const CSS = `
#edit-toggle{position:fixed;right:14px;bottom:14px;z-index:20;font:500 12px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--ui);background:var(--uiBg);border:1px solid var(--uiLine);border-radius:999px;padding:11px 16px;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;gap:8px;align-items:center;box-shadow:0 4px 18px rgba(0,0,0,.18)}
#edit-toggle:hover{border-color:var(--uiAccent)}
#edit-toggle svg{width:14px;height:14px}
#panel{position:fixed;z-index:30;top:12px;right:12px;bottom:12px;width:min(340px,calc(100vw - 24px));display:flex;flex-direction:column;color:var(--ui);background:var(--uiBg);border:1px solid var(--uiLine);border-radius:12px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 12px 40px rgba(0,0,0,.28);transform:translateX(calc(100% + 24px));transition:transform .32s cubic-bezier(.2,.8,.2,1);font:400 13px/1.4 var(--sans)}
#panel.open{transform:none}
#panel header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
#panel h2{margin:0;font:600 20px/1 var(--serif);letter-spacing:-.01em}
#panel .sub{font:400 10.5px/1.3 var(--mono);color:var(--uiMuted);letter-spacing:.07em;text-transform:uppercase;margin-top:5px}
#panel button{font:inherit;color:inherit;cursor:pointer}
.x{background:none;border:0;font-size:22px;line-height:1;padding:4px 8px;color:var(--uiMuted)}
.scroll{overflow-y:auto;overscroll-behavior:contain;padding:0 16px 16px;flex:1;-webkit-overflow-scrolling:touch}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px}
.tab{display:flex;align-items:center;gap:7px;border:1px solid var(--uiLine);background:transparent;border-radius:999px;padding:5px 11px 5px 7px;font:500 12px/1 var(--sans)}
.tab i{width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.25) inset}
.tab[aria-selected=true]{border-color:var(--uiAccent);background:color-mix(in srgb,var(--uiAccent) 12%,transparent)}
.tab .crown{font-size:10px;color:var(--uiAccent)}
.tab.add{padding:5px 12px;color:var(--uiMuted)}
.btns{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.btn{border:1px solid var(--uiLine);background:transparent;border-radius:7px;padding:7px 10px;font:500 12px/1 var(--sans)}
.btn:hover{border-color:var(--uiAccent)}
.btn:disabled{opacity:.4;cursor:default}
select{font:500 12px var(--sans);color:var(--ui);background:transparent;border:1px solid var(--uiLine);border-radius:7px;padding:7px 8px;max-width:100%}
select option{color:#222}
details{border-top:1px solid var(--uiLine)}
summary{list-style:none;cursor:pointer;padding:11px 0;font:500 11px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center}
summary::-webkit-details-marker{display:none}
summary::after{content:'+';color:var(--uiMuted);font-size:15px}
details[open] summary::after{content:'–'}
.ctl{display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin:0 0 12px}
.ctl label{font:500 12px var(--sans)}
.ctl output{font:400 11px var(--mono);color:var(--uiMuted);text-align:right;min-width:34px}
.ctl input[type=range]{grid-column:1/3;width:100%;margin:2px 0 0;accent-color:var(--uiAccent);height:22px}
.ctl .hint{grid-column:1/3;font-size:11px;color:var(--uiMuted)}
.ctl.hue input[type=range]{-webkit-appearance:none;appearance:none;height:10px;border-radius:5px;background:linear-gradient(90deg,#e0443a,#e0a63a,#9cd03a,#3ad07a,#3ab4d0,#3a5fe0,#a03ae0,#e03a8c,#e0443a);margin:8px 0}
.ctl.hue input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--sw,#fff);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4),0 1px 4px rgba(0,0,0,.4)}
.ctl.hue input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--sw,#fff);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.seg{grid-column:1/3;display:flex;flex-wrap:wrap;gap:5px}
.seg button{border:1px solid var(--uiLine);background:transparent;border-radius:6px;padding:6px 9px;font:500 12px var(--sans)}
.seg button[aria-pressed=true]{border-color:var(--uiAccent);background:color-mix(in srgb,var(--uiAccent) 14%,transparent)}
.switch{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font:500 12.5px var(--sans)}
.switch input{accent-color:var(--uiAccent);width:18px;height:18px}
.note{font:400 11px/1.45 var(--mono);color:var(--uiMuted);margin:8px 0 0}
@media (max-width:640px){
  #panel{top:auto;left:8px;right:8px;bottom:8px;width:auto;height:min(58vh,520px);transform:translateY(calc(100% + 16px))}
  #edit-toggle{right:10px;bottom:10px}
}
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
    r.setProperty('--ui', T.ui); r.setProperty('--uiBg', T.uiBg); r.setProperty('--uiLine', T.uiLine); r.setProperty('--uiMuted', T.uiMuted); r.setProperty('--uiAccent', T.uiAccent);
    r.setProperty('--serif', "Fraunces, Georgia, serif"); r.setProperty('--mono', "'Plex Mono', ui-monospace, Menlo, monospace");
    r.setProperty('--sans', "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
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
    this.btn = el('button', { id: 'edit-toggle', 'aria-expanded': 'false', 'aria-controls': 'panel', onclick: () => this.open(!this.panel.classList.contains('open')) });
    this.btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 5h8M12 5h2M2 11h2M6 11h8"/><circle cx="11" cy="5" r="1.6"/><circle cx="5" cy="11" r="1.6"/></svg><span>Edit</span>';
    this.panel = el('aside', { id: 'panel', 'aria-label': 'Dragon editor' });
    const head = el('header', {}, el('div', {}, el('h2', { text: 'Specimens' }), el('div', { class: 'sub', text: 'Breed, shape, colour' })), el('button', { class: 'x', 'aria-label': 'Close', text: '×', onclick: () => this.open(false) }));
    this.tabsEl = el('div', { class: 'tabs', role: 'tablist' });
    this.btnRow = el('div', { class: 'btns' });
    this.presetSel = el('select', { 'aria-label': 'Preset', onchange: e => { const n = e.target.value; if (!n) return; this.apply(Genome.preset(n).v); e.target.value = ''; } },
      el('option', { value: '', text: 'Preset…' }), ...Object.keys(PRESETS).map(n => el('option', { value: n, text: n })));
    this.btnRow.append(this.presetSel,
      this.mk('Random', () => this.apply(Genome.random().v)),
      this.mk('Mutate', () => this.apply(this.d.genome.mutate(0.18).v)),
      this.mk('Reset', () => this.apply(Genome.preset('Ember').v)));
    this.herdRow = el('div', { class: 'btns' });
    this.herdRow.append(
      this.mk('Add random', () => this.add(Genome.random())),
      this.mk('Clone', () => this.add(this.d.genome.mutate(0.06))),
      this.mk('Breed', () => this.breed(), 'breed'),
      this.mk('Make leader', () => w.setLeader(this.d), 'lead'),
      this.mk('Remove', () => { w.removeDragon(this.d); this.saveSoon(); }, 'remove'));
    const scroll = el('div', { class: 'scroll' }, this.tabsEl, this.btnRow, this.herdRow);
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

  mk(text, fn, id) { const b = el('button', { class: 'btn', text, onclick: fn }); if (id) b.dataset.id = id; return b; }

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
      inp.addEventListener('input', () => this.set(s.key, +inp.value));
      inp.addEventListener('dblclick', () => this.set(s.key, s.def));
      wrap.append(inp);
      if (s.hint) wrap.append(el('div', { class: 'hint', text: s.hint }));
      this.controls.set(s.key, { s, inp, out });
    }
    return wrap;
  }

  scene() {
    const w = this.world, box = el('details', { open: '' }, el('summary', { text: 'Scene' }));
    const sw = (label, get, set) => { const i = el('input', { type: 'checkbox' }); i.checked = get(); i.addEventListener('change', () => set(i.checked)); return el('label', { class: 'switch' }, el('span', { text: label }), i); };
    box.append(
      sw('Flock together', () => w.flocking, v => { w.flocking = v; }),
      sw('Paper burns', () => w.paperOn, v => { w.paperOn = v; }),
      sw('Sound', () => !w.sound.muted, v => { w.sound.unlock(); w.sound.setMuted(!v); }));
    const seg = el('div', { class: 'seg', style: 'margin:6px 0 10px' });
    for (const m of ['auto', 'light', 'dark']) {
      const b = el('button', { text: m[0].toUpperCase() + m.slice(1), 'aria-pressed': String(w.themeMode === m), onclick: () => { w.setThemeMode(m); [...seg.children].forEach(c => c.setAttribute('aria-pressed', String(c.textContent.toLowerCase() === m))); } });
      seg.append(b);
    }
    box.append(el('div', { class: 'ctl' }, el('label', { text: 'Theme' }), el('span'), seg));
    box.append(this.mk('Restore the page', () => w.restorePage()));
    return box;
  }

  footer() {
    const f = el('div', { style: 'margin-top:14px;display:flex;gap:6px;flex-wrap:wrap' });
    this.shareBtn = this.mk('Copy share link', async () => {
      const url = Store.url(this.world);
      history.replaceState(null, '', url.slice(location.origin.length));
      try { await navigator.clipboard.writeText(url); this.shareBtn.textContent = 'Copied'; } catch (_) { this.shareBtn.textContent = 'Link is in the address bar'; }
      setTimeout(() => { this.shareBtn.textContent = 'Copy share link'; }, 1800);
    });
    f.append(this.shareBtn, this.mk('Forget saved herd', () => { Store.clear(); this.shareBtn.textContent = 'Saved herd cleared'; setTimeout(() => { this.shareBtn.textContent = 'Copy share link'; }, 1500); }));
    return el('div', {}, f, el('p', { class: 'note', text: 'Double-click a slider to reset it. Your herd is kept in this browser; the share link carries every gene.' }));
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
    const w = this.world; if (!this.tabsEl) return;
    this.tabsEl.replaceChildren();
    w.dragons.forEach((d, i) => {
      const dark = w.theme.dark, pal = d.genome.palette(dark);
      const t = el('button', { class: 'tab', role: 'tab', 'aria-selected': String(d === w.selected), onclick: () => w.select(d) },
        el('i', { style: `background:${pal.skin}` }), el('span', { text: d.name }), d === w.leader && w.dragons.length > 1 ? el('span', { class: 'crown', title: 'Leader', text: '★' }) : null);
      this.tabsEl.append(t);
    });
    const n = w.dragons.length;
    if (this.herdRow) {
      this.herdRow.querySelector('[data-id=remove]').disabled = n <= 1;
      this.herdRow.querySelector('[data-id=lead]').disabled = n <= 1 || w.selected === w.leader;
      this.herdRow.querySelector('[data-id=breed]').disabled = n < 2 || n >= MAX_DRAGONS;
      for (const b of this.herdRow.children) if (b.textContent === 'Add random' || b.textContent === 'Clone') b.disabled = n >= MAX_DRAGONS;
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
      c.out.textContent = s.int ? String(val) : s.type === 'hue' ? Math.round(val) + '°' : (+val).toFixed(2);
      if (s.type === 'hue') c.inp.style.setProperty('--sw', hsl(val, 0.7, 0.5));
    }
  }
}
