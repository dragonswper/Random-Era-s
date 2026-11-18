import assert from 'node:assert/strict';
import test from 'node:test';
import { createMouseSwing } from '../src/mouse-swing.js';
import { createGame, stepGame } from '../src/simulation.js';
import { createWorld } from '../src/world.js';

test('a quick downward motion triggers a single downward swing', () => {
  const swing = createMouseSwing();
  assert.equal(swing.move(0, 17, 0), undefined);
  assert.equal(swing.move(0, 15, 18), undefined);
  assert.deepEqual(swing.move(0, 14, 36), { attack: true, attackX: 0, attackY: -1 });
  assert.equal(swing.move(0, 90, 52), undefined);
  assert.deepEqual(swing.move(0, 50, 150), { attack: true, attackX: 0, attackY: -1 });
});

test('ordinary aim and short back-and-forth motion leave attacks idle', () => {
  const swing = createMouseSwing();
  for (let time = 0; time < 500; time += 12) {
    assert.equal(swing.move(0, 4, time), undefined);
  }
  swing.reset();
  for (let index = 0; index < 12; index++) {
    assert.equal(swing.move(index % 2 ? 18 : -18, 0, index * 8), undefined);
  }
});

test('a new flick can reverse a slow look', () => {
  const swing = createMouseSwing();
  swing.move(9, 0, 0);
  swing.move(9, 0, 25);
  assert.equal(swing.move(-23, 0, 38), undefined);
  const attack = swing.move(-24, 0, 51);
  assert.equal(attack?.attackX, -1);
  assert.ok(attack.attackY === 0);
});

test('a directional attack keeps its gesture even when the heavy weapon stance lags', () => {
  const game = createGame(createWorld('SWING', 'arena'), { arenaWeapon: 'iron-axe', versus: 'online' });
  for (let frame = 0; frame < 24; frame++) stepGame(game, 1 / 60, { aimY: 1 });
  const swing = createMouseSwing().move(0, 54, 0);
  stepGame(game, 1 / 60, { aimY: 1, ...swing });
  assert.ok(game.player.aimY > 0.5);
  assert.equal(game.player.swingY, -1);
  assert.ok(game.player.stamina < game.player.maxStamina);
});
