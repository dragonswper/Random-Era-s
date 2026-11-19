import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatTuning, makeFlick } from '../src/combat.js';
import { createMouseSwing, createRelativeMouse } from '../src/mouse-swing.js';

const { MinFlickVelocity } = CombatTuning;

test('frame velocity distinguishes slow look from identical fast motion', () => {
  const mouse = createMouseSwing();
  const delta = MinFlickVelocity / 64;
  mouse.addDelta(0, delta);
  assert.equal(mouse.sample(1 / 32, true).gesture, null);
  mouse.addDelta(0, delta / 2);
  mouse.addDelta(0, delta / 2);
  const frame = mouse.sample(1 / 64, true);
  assert.equal(frame.velocity, MinFlickVelocity);
  assert.deepEqual(frame.gesture, {
    x: 0, y: -1, angle: -90, direction: 'DOWN', velocity: MinFlickVelocity,
  });

  const doubleRate = createMouseSwing();
  doubleRate.addDelta(0, delta / 2);
  assert.equal(doubleRate.sample(1 / 128, true).gesture.direction, 'DOWN');
});

test('angles select four sectors while retaining the swipe vector for rendering', () => {
  const directions = [[2, 1, 'RIGHT'], [1, 2, 'UP'], [-2, -1, 'LEFT'], [1, -2, 'DOWN']];
  for (const [x, y, category] of directions) {
    const flick = makeFlick(x, y, MinFlickVelocity);
    assert.equal(flick.direction, category);
    assert.ok(Math.abs(Math.hypot(flick.x, flick.y) - 1) < 1e-9);
    assert.equal(flick.angle, Math.atan2(y, x) * 180 / Math.PI);
  }
  assert.equal(makeFlick(1, 1, MinFlickVelocity).direction, 'UP');
  assert.equal(makeFlick(-1, 1, MinFlickVelocity).direction, 'LEFT');
  assert.equal(makeFlick(1, -1, MinFlickVelocity).direction, 'RIGHT');
  assert.equal(makeFlick(-1, -1, MinFlickVelocity).direction, 'DOWN');
});

test('a continuous swipe cannot retrigger when a locked phase opens', () => {
  const mouse = createMouseSwing();
  mouse.addDelta(28, 0);
  assert.equal(mouse.sample(1 / 60, false).gesture, null);
  mouse.addDelta(28, 0);
  assert.equal(mouse.sample(1 / 60, true).gesture, null);
  mouse.sample(0.05, true);
  mouse.addDelta(-28, 0);
  assert.equal(mouse.sample(1 / 60, true).gesture.direction, 'LEFT');
  mouse.addDelta(-28, 0);
  assert.equal(mouse.sample(1 / 60, true).gesture, null);
});

test('movement collected during a long stall is cleared', () => {
  const mouse = createMouseSwing();
  mouse.addDelta(500, 500);
  assert.equal(mouse.sample(1.2, true).gesture, null);
  assert.equal(mouse.sample(1 / 60, true).velocity, 0);
});

test('the browser listener captures only locked movement and falls back to relative mode', async (t) => {
  const previousDocument = globalThis.document;
  const mockDocument = new EventTarget();
  globalThis.document = mockDocument;
  t.after(() => { globalThis.document = previousDocument; });
  const requests = [];
  const canvas = {
    async requestPointerLock(options) {
      requests.push(options);
      if (options?.unadjustedMovement) throw new DOMException('Raw input unavailable', 'NotSupportedError');
      mockDocument.pointerLockElement = canvas;
    },
  };
  const mouse = createRelativeMouse(canvas);
  const move = () => mockDocument.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 0, movementY: -30 }));
  move();
  assert.equal(mouse.sample(1 / 60, true).gesture, null);
  await mouse.capture();
  assert.equal(mouse.isCaptured(), true);
  assert.deepEqual(requests, [{ unadjustedMovement: true }, undefined]);
  move();
  assert.equal(mouse.sample(1 / 60, true).gesture.direction, 'UP');
});
