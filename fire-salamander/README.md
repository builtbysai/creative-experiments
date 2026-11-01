# Fire Salamander — a living page

A painted fire salamander lives in a page of text: it walks after your
hand and the lines part round it; press and hold and it breathes fire.

## Try it

Open `index.html` in a browser (serve this folder over HTTP, e.g.
`python3 -m http.server`, so the font/atlas paths resolve).

## What's here

- `index.html` — minimal demo: loads the three scripts below and places
  a `<salamander-page>` custom element.
- `js/salamander-page.js` — the full salamander engine: a
  `salamander-page` custom element. Multi-canvas WebGL renderer, sprite
  atlas animation, procedural walk cycle (stride, sway, head/neck/tail
  bend), wandering behavior, text layout that parts around the creature's
  body profile, burn/glow effects. Only dependency is the knobs module.
- `js/knobs.js` — the parameter module the engine imports: every tunable
  (appearance, title/text content, walk speed, turning, bend amounts,
  colors for skin/spots/rim/eyes/fire, seed, etc.) with defaults.
- `js/shim.js` — tiny module loader written for the demo; instantiates
  the two chunk modules on demand.
- `salamander/atlas.webp` — the painted salamander sprite atlas.
- `salamander/fonts/` — EB Garamond + IBM Plex Mono woff2 used by the page.

## Notes

- The engine reads config from element attributes /
  `globalThis.SalamanderConfig` (see the knob map in the source).
- All asset paths are relative so the demo runs from any folder.
