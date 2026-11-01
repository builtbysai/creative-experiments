# Salamander — extracted from metalforge.xyz/salamander

A painted fire salamander that walks through a page of text. The lines part
round it as it walks. Extracted 2026-11-01 from the live site's JS chunks.

## Try it

Open `index.html` in a browser (serve this folder over HTTP, e.g.
`python3 -m http.server`, so the font/atlas paths resolve).

## What's here

- `index.html` — minimal working demo: loads the three scripts below and
  places a `<salamander-page>` custom element.
- `js/salamander-page.js` — the full salamander engine (58KB, as served):
  a `salamander-page` custom element. Multi-canvas WebGL renderer, sprite
  atlas animation, procedural walk cycle (stride, sway, head/neck/tail bend),
  wandering behavior, text layout that parts around the creature's body
  profile, burn/glow effects. Only dependency is the knobs module.
- `js/knobs-597429.js` — the parameter module the engine imports: every
  tunable (appearance, title/text content, walk speed, turning, bend amounts,
  colors for skin/spots/rim/eyes/fire, seed, etc.) with defaults.
- `js/shim.js` — tiny module shim written for the demo (replaces the site's
  Turbopack runtime; the real one is saved as `js/turbopack-runtime.js` for
  reference but the demo doesn't need it).
- `js/turbopack-runtime.js` — the site's module runtime, unmodified, kept for
  reference.
- `salamander/atlas.webp` — the painted salamander sprite atlas (512x2048).
- `salamander/fonts/` — EB Garamond + IBM Plex Mono woff2 used by the page.
- `src-original/` — the untouched original chunk file for reference.

## Notes

- The site's "code" tab shows a locked preview ("Pro accounts only") — this
  extraction is the actual runtime code the page ships to every visitor,
  reassembled to run standalone. No account, no API key.
- The engine reads config from element attributes / `globalThis.MFSalamander`
  (see the `P` knob map in the source); defaults reproduce the live page.
- Paths in `js/salamander-page.js` were rewritten from absolute
  (`/salamander/...`) to relative so the demo runs from any folder.
  `src-original/` keeps the pristine copy.
