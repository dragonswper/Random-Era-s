# Random Era’s

A browser-based 3D melee prototype with two modes.

- **Frontier** generates a fresh landscape with four regions, fortresses, and scattered gear. Your starting region determines your character’s faction and appearance. Defend your core and destroy the other three to win. You can respawn while your core survives.
- **Arenas** is a melee-only 1v1 in an enclosed ring. Pick a weapon for both fighters, then practice against a bot or duel a friend.

## Run locally

Use Node.js 22.12 or later and a desktop browser with WebGL 2.

```sh
npm ci
npm run dev
```

Open the address Vite prints. Run `npm run build` to produce a static site in `dist/`.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look and direct your weapon arm |
| Left click | Swing in the direction you aim |
| Right click | Hold to guard |
| Shift | Sprint |
| E | Pick up nearby gear |
| 1–6 | Equip a carried weapon |
| V | Switch between third and first person in Frontier |
| Escape | Open the game menu |

Third person is the default. Heavier weapons respond more slowly and pull the camera farther during attacks.

## Online Arenas

1. The host opens **Arenas**, selects a weapon, and clicks **Invite a friend**. Share the invite code privately.
2. The guest opens **Arenas**, clicks **Join a friend**, and pastes the invite. Send the generated response code back to the host.
3. The host pastes the response to open the match.

The connection uses WebRTC with no relay or public matchmaking. If you’re testing on one machine, **Play across two tabs** uses the same code exchange in two windows or tabs of one browser. Keep both windows visible to avoid background throttling.

## Porting to a game engine

`src/world.js` generates seeded terrain, props, spawn points, and collision data. `src/simulation.js` advances movement, combat, opponents, and objectives from input and elapsed time. Both run independently of the browser and Three.js. A Unity or Unreal port can translate these modules and replace the browser input, renderer, and networking layers with native equivalents.
