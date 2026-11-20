# Random Eras rebuild audit

## The starting build

The fixed-step combat machine carries time between phases and handles a late guest combo without replaying an old input. Swipe recognition already distinguishes short corrections from an attack. The terrain worker, drainage, graded roads and fort tests make a sound base for Frontier. The knight's named joints and gear mounts are useful contracts for the next model. The campaign has a recognizable palette and type hierarchy.

The hit animation changes with your swipe, but most cuts resolve like the same attack. A shield mostly changes a damage number. The clock gives a bot too much of its personality, and five weapons leave several eras without a signature choice. Combat has little feedback between the swoosh and a health bar moving.

Map variation shows up in terrain and the palette. Repeated silhouettes, little movement in the scene and an unlabeled minimap flatten the difference on foot. The menu already has a voice, but Loadout is a form and the Yard leaves new players to work out timing alone. The end screen says who won and omits how the fight went.

The direct invite path depends on the network supplying WebRTC addresses. The second-tab transport is useful for testing but says little about two home connections. Settings already validate individual fields. Transport, storage and renderer failure paths need more coverage. The CC0 kit and CC BY-NC-SA armor are placeholders, and the game has no editable Blender source pipeline yet.

## Baseline

All 21 tests passed and the Vite dev server started. The install needed a writable npm cache in this workspace. Chromium exercised the Yard, attack settings, guard, dagger swaps, both cameras a custom small Frontier and an Arena duel across two browser windows. The samples under software WebGL included 17 ms frames in the Yard and stalls above 200 ms in both modes. These are development measurements from this runner and cannot establish a laptop frame-rate target.

## Priorities

1. Give hits, parries and broken guards different timing and feedback.
2. Give directional cuts different combat roles and readably different trails.
3. Make factions manage space, stamina and guard in different ways.
4. Expand and balance the weapons by reach, commitment and cost.
5. Establish the editable Blender export pipeline and asset budgets.
6. Give each era a distinct silhouette, atmosphere and border.
7. Add a short Yard drill and a readable record of the match.
8. Finish Loadout and Career within the existing campaign style.
9. Reduce invite friction and test disconnect and version handling.
10. Measure frame time and exercise old saves and failure cases.

## Rebuild result

The five milestones are in GitHub history. The private browser build uses source commit `7f86ac1`. The 30-test suite covers the combat clock and late inputs, guard and parry, arm joints, asset budgets, reproducible world bytes, transport parsing and saved settings.

- Combat uses distinct cut rules, timed guard and surface feedback. Training and two-window Arena exercised swings, a queued combo, guard, camera changes, and an equipped dagger. The weapon table records the starting balance.
- Frontier uses the existing terrain and seed stream with a separate stream for landmarks, campfires and the bridge. Map shading, regions and the day/night cycle come from the same simulation snapshot.
- Loadout, Career, field map, live swipe tester and match recap are accessible through the campaign interface. The 375 px layout, keyboard focus and a plain static nested deployment passed browser checks.
- The Blender scenes and headless export were exercised end to end. The shipped public folder is about 0.50 MB. The compressed knight is 78,348 bytes and has named arm joints and equipment mounts.
- An intercepted model failure produced a successful retry. Blocking WebGL 2 produced the full-screen browser-help state.

### Software WebGL frame times

Chromium ran with SwiftShader in a 1180 × 790 CSS viewport at a device scale of 0.77 and a resolution setting of 1. Frontier used the seed `FRAME-4471`, a 60-second sample per row, and short movement bursts. These timings include frame scheduling and runner contention.

| Frontier size | Preset | Frames | Median | 95th percentile |
| --- | --- | ---: | ---: | ---: |
| Small | Medium | 222 | 266.7 ms | 516.7 ms |
| Small | Low | 213 | 283.3 ms | 566.7 ms |
| Medium | Medium | 212 | 266.6 ms | 599.9 ms |
| Medium | Low | 262 | 216.7 ms | 416.6 ms |
| Large | Medium | 230 | 266.6 ms | 483.3 ms |
| Large | Low | 263 | 216.7 ms | 383.3 ms |

The runner has no GPU render device. Both presets missed the frame-time target here. The result does not establish performance on the target integrated GPU. Small-map Low ran alongside a short browser smoke test and is especially noisy.

### Play-session check

The scripted browser run spent ten minutes sampling Frontier, Training and bot Arena, excluding startup and menu time. It captured zero runtime or console errors. Training Low recorded a 183.4 ms median and 433.3 ms 95th percentile. Bot Arena Low recorded a 133.4 ms median and 333.2 ms 95th percentile. A clean checkout also passed install, all 30 tests, and the production build.

### Open acceptance checks

- The two-window Arena path passed. A direct invite in this runner stopped at ICE address discovery. A match across two physical machines still needs verification. Reconnection covers a transient channel outage, and a closed channel needs a fresh invite.
- The renderer uses terrain and tree LOD. The Blender scene files do not include separate named LOD1 and LOD2 meshes for each prop. Era dressing uses decorative footprints. The exported collider sidecar is available for engine work.
- The asset paint is procedural Blender material and vertex work. The interface keeps the campaign tokens alongside some component-specific numeric values.
