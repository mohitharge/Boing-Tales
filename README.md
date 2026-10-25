# Boing Tales

A modern, playful 3D take on the classic *Bounce Tales*: roll a squishy red ball through
three hand-built worlds, collect gems, stomp grumpy blobs, and swap between **Bouncy** and
**Rock** forms to float, sink and smash your way to the rainbow portal.

Built with [Three.js](https://threejs.org) and Vite. Every sound and the music are synthesized
with WebAudio — there are no asset files.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## Controls

| Action | Keys | Touch |
| --- | --- | --- |
| Roll | ← → / A D | ◀ ▶ buttons |
| Jump (hold for higher) | Space / ↑ / W | big pink button |
| Pause | Esc / P | ❚❚ |
| Restart level | R | pause menu |
| Music on/off | M | ♪ (sound) |

## What's in a level

- **Gems** — collect them all for 3 stars
- **Rock orbs / Bouncy orbs** — change form. Rock is heavy: sinks in water, smashes cracked
  walls and flattens enemies. Bouncy is light: floats and jumps higher.
- **Mushroom springs**, **one-way cloud platforms**, **moving platforms**
- **Spikes** and **purple blobs** (jump on their heads)
- **Checkpoints** (flags) and the **rainbow portal** goal

Progress and stars are saved in `localStorage`.

## Code map

- `src/main.js` — renderer, game loop, camera, interactions, menus/HUD
- `src/player.js` — ball physics (fixed 120 Hz step, circle-vs-segment collision) and the face
- `src/world.js` — builds terrain, entities, decorations and background from level data
- `src/levels.js` — level layouts and color themes (easy to add more levels)
- `src/audio.js` — synthesized SFX + music loop
- `src/fx.js` — particles, procedural textures, seeded RNG
- `src/input.js` — keyboard and touch input
# Boing-Tales
# Boing-Tales
