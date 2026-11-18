const SWING_WINDOW_MS = 75;
const REARM_GAP_MS = 85;
const SWING_DISTANCE = 44;
const MIN_DIRECTIONAL_RATIO = 0.8;

export function createMouseSwing() {
  const samples = [];
  let lastMoveAt = -Infinity;
  let triggered = false;

  function reset() {
    samples.length = 0;
    lastMoveAt = -Infinity;
    triggered = false;
  }

  function move(dx, dy, time) {
    if (dx === 0 && dy === 0) return;
    if (time - lastMoveAt >= REARM_GAP_MS) reset();
    lastMoveAt = time;
    if (triggered) return;

    samples.push({ dx, dy, time });
    while (time - samples[0].time > SWING_WINDOW_MS) samples.shift();

    let x = 0;
    let y = 0;
    let path = 0;
    for (let index = samples.length - 1; index >= 0; index--) {
      const sample = samples[index];
      x += sample.dx;
      y += sample.dy;
      path += Math.hypot(sample.dx, sample.dy);
      const distance = Math.hypot(x, y);
      if (distance < SWING_DISTANCE || distance < path * MIN_DIRECTIONAL_RATIO) continue;

      triggered = true;
      samples.length = 0;
      return { attack: true, attackX: x / distance, attackY: -y / distance };
    }
  }

  return { move, reset };
}
