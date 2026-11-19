import { CombatTuning, makeFlick } from './combat.js';

const REARM_TIME = 0.045;
const STALE_FRAME_TIME = 0.75;
const NO_MOTION = Object.freeze({ dx: 0, dy: 0, velocity: 0, gesture: null });

export function createMouseSwing(minVelocity = CombatTuning.MinFlickVelocity) {
  let dx = 0;
  let dy = 0;
  let quiet = REARM_TIME;

  function addDelta(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    dx += x;
    // Browser deltas point down on Y. Combat angles use positive Y for up.
    dy -= y;
  }

  function reset() {
    dx = dy = 0;
    quiet = REARM_TIME;
  }

  function sample(dt, canFlick) {
    if (!Number.isFinite(dt) || dt <= 0) return NO_MOTION;
    // Don't replay motion accumulated while the browser was stalled or inactive.
    if (dt > STALE_FRAME_TIME) {
      reset();
      return NO_MOTION;
    }

    const velocity = Math.hypot(dx, dy) / dt;
    let gesture = null;
    if (velocity >= minVelocity) {
      if (canFlick && quiet >= REARM_TIME) gesture = makeFlick(dx, dy, velocity);
      // A continuous fast swipe stays spent, even if it began in a locked phase.
      quiet = 0;
    } else {
      quiet = Math.min(quiet + dt, REARM_TIME);
    }

    const motion = { dx, dy, velocity, gesture };
    dx = dy = 0;
    return motion;
  }

  return { addDelta, sample, reset };
}

export function createRelativeMouse(canvas) {
  const motion = createMouseSwing();
  const isCaptured = () => document.pointerLockElement === canvas;
  document.addEventListener('mousemove', (event) => {
    if (isCaptured()) motion.addDelta(event.movementX, event.movementY);
  }, { passive: true });

  async function capture() {
    if (isCaptured() || !canvas.requestPointerLock) return;
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch (error) {
      // Some browsers provide relative movement without access to raw device input.
      if (error?.name !== 'NotSupportedError' && !(error instanceof TypeError)) throw error;
      await canvas.requestPointerLock();
    }
  }

  return { isCaptured, capture, sample: motion.sample, reset: motion.reset };
}
