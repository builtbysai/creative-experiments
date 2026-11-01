# Draco: a procedural, editable dragon herd

Dragons walk through a page of text. Lines part around their bodies; hold the pointer (or Space) and the lead
dragon breathes fire. The **paper itself burns**: a fire front crawls across it, leaving glowing char, ragged
holes with the desk showing through, and soft scorch; later the page knits itself back together.

No build step, no dependencies, no sprites: ES modules and a 2D canvas.

    python3 -m http.server      # from the repo root (fonts load from ../assets)
    # open http://localhost:8000/dragon/      (?theme=dark or ?theme=light to force)

## Use it

- Move the pointer: the leader walks toward it and looks. Hold: fire. Other dragons flock behind in a loose V.
- Background picker (dock): the paper page, a **garden** (grass bends under the body and springs back, fire leaves ash,
  flowers regrow, bees and butterflies by day, fireflies at night) or **weather** (rain that sizzles on scorched paper,
  wind that carries smoke and bends the flame, fog that parts around the dragons). `?scene=garden|weather` picks one.
- Leave it alone: dragons wander, glance, sniff, stretch, yawn, shake, read and burn words, chase their tails,
  greet each other, and when tired curl up and sleep (sleep spreads to neighbours).
- **Edit** (bottom right): every gene is a slider: size, length, girth, neck, legs, toes (3 to 5), claws, wing
  span and fingers (3 to 5), horns, frills, spines, scale size, patterns, hues, flame colour, temperament.
  Presets, random, mutate, clone, breed two dragons, up to six at once. The share link carries the whole herd.

## Code map (`js/`)

| file | role |
|---|---|
| `genome.js` | `SCHEMA` of genes (the panel is generated from it), `Genome`: presets, random, mutate, cross, share encoding, palette |
| `anatomy.js` | turns a genome into proportions (leg bones, wing fingers, head, skin) |
| `dragon.js` | `Dragon`: steering, trail-following spine, phase-clock gait with two-bone IK, wings, head, emitters |
| `brain.js` | `Brain` + `Action` classes (needs, behaviours, boids flocking, collision avoidance) |
| `dragon-render.js` | `DragonRenderer`: articulated toes and wing fingers, patterns, spines, head |
| `paper.js` | burnable paper: cell fire simulation, marching-squares holes, scorch, glow |
| `page.js` | typesetting around obstacles, burning words |
| `particles.js`, `audio.js` | fire/smoke/ash; synthesised crackle, roar and haptics |
| `backdrops.js` | `Garden` and `Weather`: alternative grounds that react to the bodies and the breath |
| `world.js` | owns everything, input, theme, draw order; `ui.js` the editor; `store.js` persistence |

Extending: a new gene is one line in `SCHEMA` (add its use in `anatomy.js`/the renderer). A new behaviour is a
subclass of `Action` registered in `ACTIONS`.

Test hooks: `window.__world`, `window.__dragon.step(sec)`, `.pointer(x, y, down)`, `.state()`.
