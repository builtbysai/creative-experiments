# Draco: a procedural dragon

A dragon walks through a page of text. The lines part around its body and
close again behind it. Hold the pointer (or Space) and it breathes fire:
words catch, char, fall to ash, and the page slowly mends itself.

Original code, one file, no dependencies and no sprites. Everything is drawn
on a 2D canvas.

## Try it

Serve the repo root over HTTP (the fonts are loaded from `../assets/fonts/`):

    python3 -m http.server
    # then open http://localhost:8000/dragon/

Add `?theme=dark` or `?theme=light` to force a theme; otherwise it follows
the system setting.

## Interaction

- Move the pointer and the dragon walks toward it, stopping at a stand-off
  distance and looking at it.
- Press and hold (or hold Space) to breathe fire along the head's heading. A
  tap holds the flame for at least half a second.
- Leave it alone for a few seconds and it wanders, glances around, stretches
  its wings, puffs smoke from its nostrils, and now and then burns a word.

## How it works

- **Vehicle-style head.** The head has eased speed (accelerating gently,
  braking harder), a curvature limit (minimum turn radius about 0.14 body
  lengths), an arrival ramp, and a committed turn direction for near-180°
  turns, so it never snaps or spins on the spot.
- **Trail-following body.** The head lays down a path trail. The 40 body
  control points are sampled from that trail at fixed arc-length spacing, so
  the body length is constant and every segment follows the exact path the
  head took. A gait-synced lateral wave, an idle tail swish and a breathing
  pulse sit on top; a Catmull-Rom subdivision makes it smooth.
- **Gait.** Phase advances with distance travelled, so the stride always
  matches the ground speed. Legs trot in diagonal pairs (front-left with
  hind-right, front-right with hind-left). Each foot is planted in the world,
  steps ahead of its hip using a prediction from the current speed, and is
  solved with two-bone IK with the knee bent outward.
- **Head.** A spring-damper yaw looks at the pointer, a random glance target
  or a word, with a limit that tightens at speed. Eyes track and blink.
- **Wings.** Shoulder, wrist and four finger bones with a scalloped membrane.
  Folded while walking; they open for stretches and fire breath.
- **Rendering.** Per-slice gradient shading toward a fixed light, scale
  mosaic, belly plates, golden dorsal line, spikes scaled by local width,
  horns, frills, cheek spines, teeth, and soft cast shadows.
- **Text parting.** Every frame each line is cut into free runs around circles
  placed along the body, head and feet. Words on the same line ease
  horizontally; words that change lines snap and fade in.
- **Fire and burning.** Fire, flame, spark, ember, ash and smoke particles
  are hit-tested against a spatial hash of words. A hit word flickers, chars,
  turns to ash, and fades back in after about eight seconds; flames can creep
  to neighbouring words. Scorch marks mend on the same clock. Dark theme uses
  additive blending for fire.

## Knobs

Cruise speed, acceleration, turn radius, stand-off distance, stride length,
step thresholds, burn timings (`T_FLAME`, `T_CHAR`, `T_ASH`, `MEND`) and
breath rate are constants at the top of the dragon and `update()` sections.

`window.__dragon` exposes `step(seconds)`, `pause()`, `resume()`,
`pointer(x, y, down)`, `release()`, `trace()` and `state()` for deterministic
screenshots and tests.
