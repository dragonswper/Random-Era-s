export const WEAPONS = Object.freeze([
  { id: 'bronze-sword', name: 'Bronze Sword', era: 'Bronze Age', weight: 1.3, damage: 24, reach: 2.85, windup: 0.17, swing: 0.24, recovery: 0.26, stamina: 17, color: '#ddad6b', description: 'Quick strikes with a short reach.' },
  { id: 'iron-axe', name: 'Iron Axe', era: 'Iron Age', weight: 3.2, damage: 39, reach: 3.05, windup: 0.30, swing: 0.30, recovery: 0.43, stamina: 27, color: '#a4afbb', description: 'A heavy swing with high impact.' },
  { id: 'steel-longsword', name: 'Steel Longsword', era: 'Medieval', weight: 2.1, damage: 31, reach: 3.45, windup: 0.24, swing: 0.25, recovery: 0.34, stamina: 22, color: '#d4def0', description: 'A long reach with a measured swing.' },
  { id: 'plasma-blade', name: 'Plasma Blade', era: 'Future', weight: 0.8, damage: 26, reach: 3.05, windup: 0.14, swing: 0.21, recovery: 0.32, stamina: 20, color: '#73eed6', description: 'A light blade that follows the mouse closely.' },
].map(Object.freeze));

const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const REGION_WEAPON = {
  ironwood: 'steel-longsword',
  sunscar: 'bronze-sword',
  frostfall: 'iron-axe',
  glassreach: 'plasma-blade',
};
const ACTOR_RADIUS = 0.47;
const CORE_RADIUS = 0.85;
const STAMINA_REGEN = 22;
const EMPTY_INPUT = Object.freeze({});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const axis = (value) => Number.isFinite(value) ? clamp(value, -1, 1) : 0;
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const heading = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const regionId = (region) => typeof region === 'object' ? region?.id : region;

export function getWeapon(id) {
  return WEAPON_BY_ID.get(id) || WEAPONS[0];
}

function seedValue(seed) {
  let value = 2166136261;
  for (const character of String(seed)) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  }
  return value >>> 0;
}

function random(game) {
  game.randomState = (Math.imul(game.randomState, 1664525) + 1013904223) >>> 0;
  return game.randomState / 4294967296;
}

function makeActor(id, team, spawn, weaponId, region, name) {
  const facing = Number.isFinite(spawn.yaw) ? spawn.yaw + Math.PI : (spawn.facing || 0);
  return {
    id, team, name, regionId: regionId(region), x: spawn.x, z: spawn.z, facing,
    spawn: { x: spawn.x, z: spawn.z, facing },
    health: 100, maxHealth: 100, stamina: 100, maxStamina: 100,
    alive: true, guarding: false, aimX: 0.65, aimY: 0.15, speed: 0,
    swing: -1, swingX: 0, swingY: 0, attack: null, regenDelay: 0,
    weaponId, inventory: [weaponId], respawnAt: 0, attackAt: 0, routeAt: 0,
    route: [], routeGoal: null, approachSide: team % 2 ? -1 : 1,
  };
}

export function createGame(world, { arenaWeapon, versus } = {}) {
  const arena = world.mode === 'arena';
  const game = {
    world, actors: [], cores: [], pickups: [], events: [], status: 'playing', time: 0,
    player: null, rival: null, versus: arena && (versus === 'online' || versus === true) ? 'online' : 'bot',
    randomState: seedValue(world.seed),
  };

  world.spawns.forEach((spawn, index) => {
    const fort = world.forts[index];
    const region = spawn.region || fort?.region || world.regionAt(spawn.x, spawn.z);
    const weapon = getWeapon(arena ? arenaWeapon : REGION_WEAPON[regionId(region)]);
    const name = index === 0 ? 'You' : arena ? 'Challenger' : `${region?.faction || 'Frontier'} Guard`;
    game.actors.push(makeActor(index === 0 ? 'player' : `rival-${index}`, index, spawn, weapon.id, region, name));
  });
  game.player = game.actors[0];
  game.rival = arena ? game.actors[1] : null;

  world.forts.forEach((fort, index) => {
    game.cores.push({
      id: `${fort.id}-core`, fortId: fort.id, team: index, regionId: regionId(fort.region),
      x: fort.core.x, z: fort.core.z, maxHealth: fort.core.maxHealth, health: fort.core.maxHealth,
    });
  });

  world.props.forEach((prop, index) => {
    if (prop.kind !== 'pickup') return;
    const item = prop.item || 'weapon';
    const weapon = item === 'weapon' ? WEAPONS[Math.floor(random(game) * WEAPONS.length)] : null;
    game.pickups.push({
      id: prop.id || `pickup-${index}`, x: prop.x, z: prop.z, item,
      weaponId: weapon?.id, available: true,
    });
  });

  return game;
}

export function equipWeapon(game, index) {
  const player = game.player;
  const weaponId = player.inventory[index];
  if (!player.alive || player.attack || !weaponId || game.world.mode === 'arena') return false;
  player.weaponId = weaponId;
  return true;
}

function emit(game, type, entity, details = {}) {
  game.events.push({ type, x: entity.x, z: entity.z, ...details });
}

function lineClear(world, from, to, endClearance = 0) {
  const gap = distance(from, to);
  const travel = gap - endClearance;
  if (travel <= 0) return true;
  const steps = Math.ceil(travel / 0.65);
  for (let step = 1; step <= steps; step++) {
    if (step === steps && !endClearance) break;
    const fraction = (step / steps) * (travel / gap);
    if (!world.canMove(from.x + (to.x - from.x) * fraction, from.z + (to.z - from.z) * fraction, ACTOR_RADIUS)) {
      return false;
    }
  }
  return true;
}

function findRoute(world, from, to, endClearance) {
  const spacing = 1.65;
  const width = Math.floor(world.size / spacing);
  const offset = (width - 1) * spacing * 0.5;
  const coordinate = (index) => ({ x: (index % width) * spacing - offset, z: Math.floor(index / width) * spacing - offset });
  const nearest = (point, clearance = 0) => {
    const column = Math.round((point.x + offset) / spacing);
    const row = Math.round((point.z + offset) / spacing);
    let best = -1;
    let bestDistance = Infinity;
    for (let z = Math.max(0, row - 2); z <= Math.min(width - 1, row + 2); z++) {
      for (let x = Math.max(0, column - 2); x <= Math.min(width - 1, column + 2); x++) {
        const index = z * width + x;
        const cell = coordinate(index);
        const gap = distance(point, cell);
        if (gap < bestDistance && world.canMove(cell.x, cell.z, ACTOR_RADIUS) && lineClear(world, cell, point, clearance)) {
          best = index;
          bestDistance = gap;
        }
      }
    }
    return best;
  };

  const start = nearest(from);
  const goal = nearest(to, endClearance);
  if (start < 0 || goal < 0 || start === goal) return [];

  const visited = new Int32Array(width * width).fill(-1);
  const open = new Int32Array(width * width);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  visited[start] = start;
  open[0] = start;
  let count = 1;
  for (let cursor = 0; cursor < count && visited[goal] < 0; cursor++) {
    const current = open[cursor];
    const currentCell = coordinate(current);
    for (const [dx, dz] of directions) {
      const x = current % width + dx;
      const z = Math.floor(current / width) + dz;
      if (x < 0 || z < 0 || x >= width || z >= width) continue;
      const next = z * width + x;
      if (visited[next] >= 0) continue;
      const nextCell = coordinate(next);
      if (!world.canMove(nextCell.x, nextCell.z, ACTOR_RADIUS) || !lineClear(world, currentCell, nextCell)) continue;
      visited[next] = current;
      open[count++] = next;
    }
  }
  if (visited[goal] < 0) return [];

  const waypoints = [];
  for (let index = goal; index !== start; index = visited[index]) waypoints.push(coordinate(index));
  waypoints.push(coordinate(start));
  return waypoints.reverse();
}

function routeHeading(game, actor, target, endClearance, targetVisible) {
  if (targetVisible) {
    actor.route = [];
    actor.routeGoal = null;
    return heading(actor, target);
  }
  if (game.time >= actor.routeAt && (!actor.routeGoal || distance(target, actor.routeGoal) > 2 || actor.route.length === 0)) {
    actor.route = findRoute(game.world, actor, target, endClearance);
    actor.routeAt = game.time + 1.2;
    actor.routeGoal = { x: target.x, z: target.z };
  }
  while (actor.route.length && distance(actor, actor.route[0]) < 0.55) actor.route.shift();
  for (let index = Math.min(7, actor.route.length - 1); index >= 1; index--) {
    if (lineClear(game.world, actor, actor.route[index])) {
      actor.route.splice(0, index);
      break;
    }
  }
  if (actor.route.length) return heading(actor, actor.route[0]);

  const direct = heading(actor, target);
  for (const turn of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const angle = direct + turn * actor.approachSide;
    if (game.world.canMove(actor.x + Math.sin(angle) * 1.1, actor.z + Math.cos(angle) * 1.1, ACTOR_RADIUS)) return angle;
  }
  return direct;
}

function getAiInput(game, actor) {
  const player = game.player;
  const arena = game.world.mode === 'arena';
  const ownCore = game.cores[actor.team];
  const weapon = getWeapon(actor.weaponId);
  const playerDistance = distance(actor, player);
  const raid = game.time > 38 + actor.team * 14;
  const defend = playerDistance < 10 || (distance(player, ownCore || actor.spawn) < 7.5 && playerDistance < 15);
  const target = (arena || defend) && player.alive ? player : raid ? game.cores[0] : actor.spawn;
  const spacing = distance(actor, target);
  const fighting = target !== actor.spawn;
  const core = target === game.cores[0];
  const endClearance = core ? CORE_RADIUS + ACTOR_RADIUS : 0;
  const reachable = spacing < weapon.reach + (core ? 0.65 : 0.3);
  const targetVisible = lineClear(game.world, actor, target, endClearance);
  let moveX = 0;
  let moveZ = 0;
  let facing = fighting ? heading(actor, target) : actor.spawn.facing;
  let attack = false;
  const guard = arena && player.attack && playerDistance < 4.2 && !actor.attack && actor.stamina > 24
    && Math.sin(game.time * 3.1 + actor.team) > -0.2;

  if (spacing > (fighting ? weapon.reach * 0.75 : 1.05) || (fighting && !targetVisible)) {
    const direction = routeHeading(game, actor, target, endClearance, targetVisible);
    moveX = Math.sin(direction);
    moveZ = Math.cos(direction);
    if (!reachable || !targetVisible) facing = direction;
  } else if (arena && spacing > 1.1 && !actor.attack) {
    moveX = Math.cos(facing) * actor.approachSide * 0.43;
    moveZ = -Math.sin(facing) * actor.approachSide * 0.43;
  }

  if (fighting && reachable && targetVisible && !guard && !actor.attack && game.time >= actor.attackAt) {
    attack = true;
    actor.attackAt = game.time + 0.65 + random(game) * 0.62;
    if (random(game) > 0.54) actor.approachSide *= -1;
  }

  return {
    moveX, moveZ, facing, attack, guard, aimX: guard ? -player.swingX : actor.approachSide * 0.8,
    aimY: guard ? player.swingY : Math.sin(game.time * 1.8) * 0.45,
  };
}

function moveActor(game, actor, input, dt, sprint) {
  let x = axis(input.moveX);
  let z = axis(input.moveZ);
  const magnitude = Math.hypot(x, z);
  if (!magnitude) {
    actor.speed = 0;
    return;
  }
  if (magnitude > 1) {
    x /= magnitude;
    z /= magnitude;
  }

  const speed = sprint ? 8.7 : actor.guarding ? 3.2 : actor.attack ? 4.25 : 6.3;
  const startX = actor.x;
  const startZ = actor.z;
  const nextX = startX + x * speed * dt;
  const nextZ = startZ + z * speed * dt;
  const clear = (atX, atZ) => game.world.canMove(atX, atZ, ACTOR_RADIUS) && game.actors.every((other) => {
    if (other === actor || !other.alive) return true;
    const nextDistance = Math.hypot(atX - other.x, atZ - other.z);
    return nextDistance >= ACTOR_RADIUS * 1.9 || nextDistance > distance(actor, other);
  });

  if (clear(nextX, nextZ)) {
    actor.x = nextX;
    actor.z = nextZ;
  } else {
    if (clear(nextX, startZ)) actor.x = nextX;
    if (clear(actor.x, nextZ)) actor.z = nextZ;
  }
  actor.speed = Math.hypot(actor.x - startX, actor.z - startZ) / dt;
}

function inStrike(game, actor, target, radius, weapon, endClearance = 0) {
  const range = distance(actor, target);
  if (range > weapon.reach + radius) return false;
  const strikeAngle = actor.facing + actor.swingX * 0.26;
  const angle = heading(actor, target) - strikeAngle;
  return (range < 0.95 || Math.cos(angle) > 0.35) && lineClear(game.world, actor, target, endClearance);
}

function damageActor(game, attacker, target, weapon) {
  const facingAttack = Math.cos(heading(target, attacker) - target.facing) > 0.25;
  const blocked = target.guarding && facingAttack && target.stamina >= 10;
  const directional = Math.hypot(target.aimX + attacker.swingX, target.aimY - attacker.swingY) < 0.88;
  const damage = blocked ? Math.round(weapon.damage * (directional ? 0.12 : 0.36)) : weapon.damage;
  target.health = Math.max(0, target.health - damage);
  const details = { actorId: attacker.id, targetId: target.id, damage, directional };
  if (blocked) {
    target.stamina = Math.max(0, target.stamina - (directional ? 10 : 19));
    target.regenDelay = 0.5;
  }
  emit(game, blocked ? 'block' : 'hit', target, details);
  if (target.health === 0) downActor(game, target, attacker.id);
}

function downActor(game, target, attackerId) {
  if (!target.alive) return;
  target.alive = false;
  target.speed = 0;
  target.swing = -1;
  target.attack = null;
  target.guarding = false;
  target.respawnAt = game.time + 2.5;
  emit(game, 'actor-down', target, { actorId: target.id, attackerId });
}

function damageCore(game, attacker, core, weapon) {
  const damage = Math.round(weapon.damage * (attacker.team === 0 ? 1.25 : 0.48));
  core.health = Math.max(0, core.health - damage);
  emit(game, 'core-hit', core, { actorId: attacker.id, targetId: core.id, team: core.team, damage });
  if (core.health !== 0) return;
  const defender = game.actors[core.team];
  if (defender) downActor(game, defender, attacker.id);
  emit(game, 'core-destroyed', core, { actorId: attacker.id, targetId: core.id, team: core.team });
}

function connectStrike(game, actor, weapon) {
  for (const target of game.actors) {
    if (target.team !== actor.team && target.alive && inStrike(game, actor, target, ACTOR_RADIUS, weapon)) {
      damageActor(game, actor, target, weapon);
    }
  }
  for (const core of game.cores) {
    if (core.team !== actor.team && core.health > 0 && inStrike(game, actor, core, CORE_RADIUS, weapon, CORE_RADIUS + ACTOR_RADIUS)) {
      damageCore(game, actor, core, weapon);
    }
  }
}

function beginAttack(game, actor, weapon) {
  actor.attack = { time: 0, hit: false };
  actor.swing = 0;
  actor.swingX = Math.abs(actor.aimX) + Math.abs(actor.aimY) > 0.12 ? actor.aimX : 0.65;
  actor.swingY = actor.aimY;
  actor.stamina -= weapon.stamina;
  actor.regenDelay = 0.5;
  emit(game, 'swing', actor, { actorId: actor.id, weaponId: weapon.id });
}

function updateActor(game, actor, input, dt) {
  if (!actor.alive) {
    if (game.cores[actor.team]?.health > 0 && game.time >= actor.respawnAt) {
      Object.assign(actor, actor.spawn, { health: actor.maxHealth, stamina: actor.maxStamina, alive: true, route: [], routeGoal: null });
      emit(game, 'respawn', actor, { actorId: actor.id });
    }
    return;
  }

  const weapon = getWeapon(actor.weaponId);
  if (Number.isFinite(input.facing)) actor.facing = input.facing;
  const aimAlpha = 1 - Math.exp(-dt * (17 / (1 + weapon.weight * 0.52)));
  actor.aimX += (axis(input.aimX) - actor.aimX) * aimAlpha;
  actor.aimY += (axis(input.aimY) - actor.aimY) * aimAlpha;
  actor.guarding = Boolean(input.guard && actor.stamina > 7 && !actor.attack);
  const sprint = Boolean(input.sprint && actor.stamina > 5 && !actor.guarding && !actor.attack && (axis(input.moveX) || axis(input.moveZ)));

  if (input.attack && !actor.guarding && !actor.attack && actor.stamina >= weapon.stamina) beginAttack(game, actor, weapon);
  moveActor(game, actor, input, dt, sprint && !actor.attack);

  if (sprint && !actor.attack) {
    actor.stamina = Math.max(0, actor.stamina - 24 * dt);
    actor.regenDelay = 0.35;
  } else {
    actor.regenDelay = Math.max(0, actor.regenDelay - dt);
    if (!actor.regenDelay) actor.stamina = Math.min(actor.maxStamina, actor.stamina + STAMINA_REGEN * (actor.guarding ? 0.36 : 1) * dt);
  }

  if (actor.attack) {
    actor.attack.time += dt;
    actor.swing = actor.attack.time / (weapon.windup + weapon.swing + weapon.recovery);
  }
}

function finishAttack(actor) {
  if (!actor.attack) return null;
  const weapon = getWeapon(actor.weaponId);
  const striking = !actor.attack.hit && actor.attack.time >= weapon.windup + weapon.swing * 0.35;
  if (striking) actor.attack.hit = true;
  if (actor.swing >= 1) {
    actor.attack = null;
    actor.swing = -1;
  }
  return striking ? weapon : null;
}

export function nearbyPickup(game) {
  const player = game.player;
  if (!player.alive) return null;
  let nearest = null;
  let range = 2.45;
  for (const pickup of game.pickups) {
    const gap = distance(pickup, player);
    if (pickup.available && gap < range && lineClear(game.world, player, pickup)) {
      nearest = pickup;
      range = gap;
    }
  }
  return nearest;
}

function collectPickup(game) {
  const player = game.player;
  const pickup = nearbyPickup(game);
  if (!pickup) return;
  let name;
  if (pickup.item === 'medkit') {
    if (player.health === player.maxHealth) return;
    player.health = Math.min(player.maxHealth, player.health + 45);
    name = 'Medkit';
  } else if (pickup.item === 'stamina') {
    if (player.stamina === player.maxStamina) return;
    player.stamina = player.maxStamina;
    name = 'Stamina Tonic';
  } else {
    const weapon = getWeapon(pickup.weaponId);
    if (player.attack) return;
    if (!player.inventory.includes(weapon.id)) player.inventory.push(weapon.id);
    player.weaponId = weapon.id;
    name = weapon.name;
  }
  pickup.available = false;
  emit(game, 'pickup', pickup, { actorId: player.id, item: pickup.item, weaponId: pickup.weaponId, name });
}

export function stepGame(game, elapsed, input = EMPTY_INPUT, rivalInput = EMPTY_INPUT) {
  game.events.length = 0;
  if (game.status !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return game;
  const dt = Math.min(elapsed, 0.05);
  game.time += dt;
  const actorInputs = [input];
  for (const actor of game.actors.slice(1)) {
    actorInputs.push(game.versus === 'online' ? rivalInput : actor.alive ? getAiInput(game, actor) : EMPTY_INPUT);
  }
  for (const [index, actor] of game.actors.entries()) updateActor(game, actor, actorInputs[index], dt);
  const strikes = game.actors.map(finishAttack);
  for (const [index, weapon] of strikes.entries()) {
    if (weapon) connectStrike(game, game.actors[index], weapon);
  }
  if (input.interact) collectPickup(game);

  if (game.world.mode === 'arena') {
    if (!game.player.alive && !game.rival.alive) game.status = 'draw';
    else if (!game.player.alive) game.status = 'lost';
    else if (!game.rival.alive) game.status = 'won';
  } else if (game.cores[0].health === 0) {
    game.status = 'lost';
  } else if (game.cores.every((core) => core.team === 0 || core.health === 0)) {
    game.status = 'won';
  }
  if (game.status !== 'playing') emit(game, 'match-end', game.player, { status: game.status });
  return game;
}
