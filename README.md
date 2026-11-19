# Random Eras

A first-person browser melee game with seeded terrain, a playable armored knight, and three modes.

- **Frontier** puts four strongholds in one landscape. Explore, collect era weapons, defend your core and destroy the rival cores. Use a daily seed or choose a starting era, size and seed.
- **The Pit** is an enclosed melee duel against a bot or a friend. Both fighters ready up before an online duel.
- **Training** has stationary and strafing targets that reset after being defeated. Practice movement, flicks, switching targets and chaining attacks without incoming damage.

## Run locally

Use Node.js 22.12 or later and a desktop browser with WebGL 2.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite prints the local URL. The production build is in `dist/`.

## Default controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Gentle mouse movement | Look and position your weapon |
| Quick mouse flick | Slash up, down, left or right |
| Flick when the reticle shows an extra ring | Queue a follow-up during the final 30% of the active swing |
| Hold right click | Guard with the shield |
| Shift | Sprint |
| E | Pick up nearby gear |
| 1–6 | Equip a carried weapon |
| V | Switch between first and third person in Frontier or Training |
| Tab | Match status |
| Escape | Game menu |

Click the game if it needs to capture the mouse. The cursor is hidden while captured, with unadjusted relative movement when supported. `CombatTuning` in `src/combat.js` exposes `MinFlickVelocity`, `InputCooldown`, and `BufferWindow`. Per-weapon timing lives in `src/simulation.js`.

## Play with a friend

1. Open **Arena**. The host picks an age and weapon and selects **Invite a friend**.
2. The guest opens **Join a friend**, pastes the invite, and sends back the generated response.
3. The host pastes the response. Both players select **Ready**.

Both players should load the current build. The connection uses direct WebRTC. **Play across two tabs** uses the same code exchange for side-by-side windows in one browser profile. The Frontier camp is a local lobby preview with bot rivals.

## Porting and credits

Terrain generation and combat timing run independently of the browser renderer. Terrain exports and the engine mapping are documented in [PORTING.md](PORTING.md). The menu flow and design tokens are documented in [UI_PORTING.md](UI_PORTING.md).

The playable armor, equipment, and portrait are adapted from **Armor Set** by gimora. The game asset separates rigid pieces, resets weapon pivots, and resizes textures for the browser. This modified asset and portrait are distributed under CC BY-NC-SA 4.0. [Original model](https://sketchfab.com/3d-models/armor-set-a28d0e34d39b47c59d599bf7bc790fb2) · [License](https://creativecommons.org/licenses/by-nc-sa/4.0/)

The training drills draw on the glossary’s distinctions between flicking, microcorrection, target switching and smooth tracking. The reference review covered the Markdown and configuration at commit `4bc23a8`; no repository code or dependencies are used. [Aiming Taxonomy](https://github.com/aiming-taxonomy/glossary/tree/4bc23a80e80563b7e027f7aaeda12385da0d114a)
