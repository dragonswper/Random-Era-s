import './style.css';
import { createWorld } from './world.js';
import { WEAPONS, createGame, equipWeapon, getWeapon, nearbyPickup, stepGame } from './simulation.js';
import { createRenderer } from './render.js';
import { createHostSession, createGuestSession } from './network.js';
import { createMouseSwing } from './mouse-swing.js';

const element = (id) => document.getElementById(id);
const menu = element('menu');
const gameScreen = element('game');
const canvas = element('game-canvas');
const minimap = element('minimap');
const mapContext = minimap.getContext('2d');
const mapLayer = document.createElement('canvas');
mapLayer.width = minimap.width;
mapLayer.height = minimap.height;
const mapBase = mapLayer.getContext('2d');
const arenaDialog = element('arena-dialog');
const controlsDialog = element('controls-dialog');
const pauseDialog = element('pause-dialog');
const endDialog = element('end-dialog');
const weaponSelect = element('arena-weapon');
const networkOutput = element('network-output');
const networkInput = element('network-input');
const networkConnect = element('network-connect');
const keys = new Set();
const mouseSwing = createMouseSwing();
const view = { yaw: 0, pitch: -0.16, firstPerson: false, actorId: undefined };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const localActor = () => networkRole === 'guest' ? match?.rival : match?.player;
const remoteActor = () => networkRole === 'guest' ? match?.player : match?.rival;
const isOnline = () => match?.versus === 'online';
const canPlay = () => match?.status === 'playing' && !pauseDialog.open && !controlsDialog.open;
const isCapturing = () => document.pointerLockElement === canvas;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
const modal = (dialog) => { if (!dialog.open) dialog.showModal(); };
const close = (dialog) => { if (dialog.open) dialog.close(); };

let match;
let renderer;
let network;
let networkRole;
let remoteInput = {};
let remoteInputAt = 0;
let guestSwing;
let networkStepAt = 0;
let lastFrame = 0;
let accumulated = 0;
let frameRequest;
let pendingSwing;
let guarding = false;
let interact = false;
let aimX = 0.65;
let aimY = 0.15;
let notice = '';
let noticeUntil = 0;
let hudAt = 0;
let lastInventory = '';
let blockUnlock = false;
let lastLookAt = 0;
let matchStarting = false;

for (const weapon of WEAPONS) {
  const option = document.createElement('option');
  option.value = weapon.id;
  option.textContent = `${weapon.name} · ${weapon.weight} kg`;
  weaponSelect.append(option);
}
weaponSelect.value = 'steel-longsword';

function releaseInput() {
  keys.clear();
  mouseSwing.reset();
  pendingSwing = undefined;
  interact = false;
  guarding = false;
}

function unlockPointer() {
  if (!isCapturing()) return;
  blockUnlock = true;
  document.exitPointerLock();
}

function capturePointer() {
  if (isCapturing() || !canvas.requestPointerLock) return;
  try {
    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  } catch {
    // Browsers that restrict pointer lock still support dragging the view.
  }
}

function openError(message) {
  element('error-message').textContent = message;
  modal(element('error-dialog'));
}

function startMatch(mode, { worldSeed = seed(), arenaWeapon = weaponSelect.value, online = false } = {}) {
  matchStarting = true;
  try {
    if (!online) disconnect();
    close(arenaDialog);
    close(pauseDialog);
    close(controlsDialog);
    close(endDialog);
    menu.hidden = true;
    gameScreen.hidden = false;
    renderer ??= createRenderer(canvas);
    const world = createWorld(worldSeed, mode);
    match = createGame(world, { arenaWeapon, versus: online ? 'online' : 'bot' });
    renderer.setWorld(world);
    Object.assign(view, {
      yaw: localActor().facing, pitch: -0.16, firstPerson: false,
      actorId: networkRole === 'guest' ? localActor().id : undefined,
    });
    aimX = 0.65;
    aimY = 0.15;
    notice = '';
    noticeUntil = 0;
    hudAt = 0;
    lastInventory = null;
    networkStepAt = 0;
    accumulated = 0;
    lastFrame = 0;
    releaseInput();
    drawMapBase(world);
    updateHud(performance.now());
    renderer.draw(match, view, 0);
    canvas.focus({ preventScroll: true });
    if (!online) capturePointer();
    if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(frame);
    return true;
  } catch (error) {
    console.error(error);
    returnToMenu();
    openError('This prototype needs WebGL 2. Check that hardware acceleration is enabled and try a current desktop browser.');
    return false;
  } finally {
    matchStarting = false;
  }
}

function disconnect() {
  const previous = network;
  network = undefined;
  networkRole = undefined;
  remoteInput = {};
  remoteInputAt = 0;
  guestSwing = undefined;
  previous?.close();
}

function returnToMenu() {
  if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
  frameRequest = undefined;
  unlockPointer();
  releaseInput();
  disconnect();
  match = undefined;
  close(pauseDialog);
  close(controlsDialog);
  close(endDialog);
  gameScreen.hidden = true;
  menu.hidden = false;
  element('play-frontier').focus({ preventScroll: true });
}

function showPause() {
  if (match?.status !== 'playing' || pauseDialog.open) return;
  unlockPointer();
  releaseInput();
  element('pause-note').textContent = isOnline()
    ? 'The duel continues while this menu is open.'
    : 'Resume when you’re ready.';
  modal(pauseDialog);
}

function resume() {
  close(pauseDialog);
  canvas.focus({ preventScroll: true });
  capturePointer();
}

function controls() {
  if (match?.status === 'playing' && !pauseDialog.open) showPause();
  modal(controlsDialog);
}

function activeLook(event) {
  if (!canPlay()) return;
  const locked = isCapturing();
  if (!locked && event.target !== canvas) {
    mouseSwing.reset();
    return;
  }
  const dx = clamp(event.movementX, -150, 150);
  const dy = clamp(event.movementY, -150, 150);
  if (!dx && !dy) return;
  if (locked || event.buttons & 4) {
    view.yaw = Math.atan2(Math.sin(view.yaw - dx * 0.0029), Math.cos(view.yaw - dx * 0.0029));
    view.pitch = clamp(view.pitch - dy * 0.0025, -0.71, 0.61);
  } else {
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left + rect.width * 0.12) view.yaw += Math.abs(dx) * 0.003;
    if (event.clientX > rect.right - rect.width * 0.12) view.yaw -= Math.abs(dx) * 0.003;
  }
  const magnitude = Math.hypot(dx, dy);
  const response = Math.min(magnitude / 17, 1);
  aimX += (dx / magnitude - aimX) * response;
  aimY += (-dy / magnitude - aimY) * response;
  if (!guarding && localActor().alive) {
    const swing = mouseSwing.move(dx, dy, event.timeStamp);
    pendingSwing ??= swing;
  }
  lastLookAt = performance.now();
}

function makeInput() {
  if (!canPlay()) return { facing: view.yaw, aimX, aimY };
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const side = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const sin = Math.sin(view.yaw);
  const cos = Math.cos(view.yaw);
  return {
    moveX: forward * sin - side * cos,
    moveZ: forward * cos + side * sin,
    facing: view.yaw,
    aimX, aimY, interact, guard: guarding,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    ...pendingSwing,
  };
}

document.addEventListener('mousemove', activeLook);
canvas.addEventListener('mousedown', (event) => {
  if (!canPlay()) return;
  event.preventDefault();
  if (!isCapturing()) capturePointer();
  if (event.button === 2) {
    guarding = true;
    pendingSwing = undefined;
    mouseSwing.reset();
  }
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 2) guarding = false;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('blur', releaseInput);
document.addEventListener('pointerlockchange', () => {
  mouseSwing.reset();
  pendingSwing = undefined;
  if (!isCapturing() && !blockUnlock && !matchStarting && match?.status === 'playing') showPause();
  blockUnlock = false;
});
document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && match?.status === 'playing' && !pauseDialog.open && !controlsDialog.open) {
    event.preventDefault();
    showPause();
    return;
  }
  if (!canPlay()) return;
  const { code } = event;
  if (code.startsWith('Arrow') || ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyV'].includes(code)) event.preventDefault();
  keys.add(code);
  if (event.repeat) return;
  if (code === 'KeyE') interact = true;
  if (code === 'KeyV' && match.world.mode === 'frontier') view.firstPerson = !view.firstPerson;
  if (/^Digit[1-6]$/.test(code)) equipWeapon(match, Number(code.at(-1)) - 1);
});
document.addEventListener('keyup', (event) => keys.delete(event.code));

for (const button of document.querySelectorAll('[data-controls]')) button.addEventListener('click', controls);
for (const button of document.querySelectorAll('[data-open-arena]')) button.addEventListener('click', () => {
  element('network-panel').hidden = true;
  modal(arenaDialog);
});
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => close(button.closest('dialog')));
}
element('play-frontier').addEventListener('click', () => startMatch('frontier'));
element('mode-frontier').addEventListener('click', () => startMatch('frontier'));
element('practice').addEventListener('click', () => startMatch('arena'));
element('pause').addEventListener('click', showPause);
element('resume').addEventListener('click', resume);
element('quit').addEventListener('click', returnToMenu);
element('leave-end').addEventListener('click', returnToMenu);
element('replay').addEventListener('click', () => startMatch(match.world.mode));
pauseDialog.addEventListener('cancel', (event) => { event.preventDefault(); resume(); });
endDialog.addEventListener('cancel', (event) => { event.preventDefault(); returnToMenu(); });

function flash(text, now = performance.now()) {
  notice = text;
  noticeUntil = now + 2100;
  hudAt = 0;
}

function processEvents(events, now) {
  const id = localActor().id;
  const team = localActor().team;
  for (const event of events) {
    if (event.type === 'pickup' && event.actorId === id) flash(`Picked up ${event.name}`, now);
    if (event.type === 'core-hit' && event.team === team) flash('Your core is under attack!', now);
    if (event.type === 'core-destroyed' && event.team !== team) flash('Rival core destroyed', now);
    if (event.type === 'block' && event.targetId === id) flash(event.directional ? 'Directed guard' : 'Guarded hit', now);
    if (event.type === 'respawn' && event.actorId === id) {
      view.yaw = localActor().facing;
      flash('Respawned at your stronghold', now);
    }
  }
}

function frame(now) {
  frameRequest = undefined;
  if (!match) return;
  const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.07) : 0;
  lastFrame = now;
  if (match.status === 'playing') {
    if (isOnline() && networkRole === 'guest') {
      if (now >= networkStepAt) {
        const sent = network?.send({ type: 'input', input: makeInput() });
        if (sent) pendingSwing = undefined;
        networkStepAt = now + 33;
      }
    } else if (canPlay() || isOnline()) {
      accumulated += elapsed;
      while (accumulated >= 1 / 60 && match.status === 'playing') {
        const input = makeInput();
        const peer = now - remoteInputAt < 500 ? { ...remoteInput, ...guestSwing } : {};
        guestSwing = undefined;
        stepGame(match, 1 / 60, input, peer);
        processEvents(match.events, now);
        pendingSwing = undefined;
        interact = false;
        accumulated -= 1 / 60;
      }
      if (isOnline() && (now >= networkStepAt || match.status !== 'playing')) {
        sendSnapshot();
        networkStepAt = now + 50;
      }
    }
  }
  renderer.draw(match, view, elapsed);
  if (now >= hudAt) {
    updateHud(now);
    hudAt = now + 100;
  }
  if (match.status !== 'playing' && !endDialog.open) finish();
  frameRequest = requestAnimationFrame(frame);
}

function setText(id, text) {
  const node = element(id);
  if (node.textContent !== text) node.textContent = text;
}

function setMeter(id, value, maximum) {
  const meter = element(id);
  meter.max = maximum;
  meter.value = value;
  setText(`${id}-value`, String(Math.ceil(value)));
}

function updateHud(now) {
  const player = localActor();
  const rival = remoteActor();
  const { world } = match;
  const arena = world.mode === 'arena';
  const region = world.regionAt(player.x, player.z);
  const startingRegion = world.regions.find(({ id }) => id === player.regionId);
  setText('hud-mode', arena ? 'ARENAS · 1V1' : 'FRONTIER');
  setText('hud-region', region.name);
  setText('hud-faction', arena ? (isOnline() ? 'Online duel' : 'Practice duel') : startingRegion.faction);
  setText('hud-objective', arena ? 'Defeat your challenger' : 'Defend your core. Destroy rival cores.');
  const ownCore = match.cores[0];
  const remaining = match.cores.filter((core) => core.team && core.health > 0).length;
  setText('hud-cores', arena ? '' : `Your core ${Math.ceil(100 * ownCore.health / ownCore.maxHealth)}% · Rival cores ${remaining}`);
  setMeter('health', player.health, player.maxHealth);
  setMeter('stamina', player.stamina, player.maxStamina);
  element('rival-vitals').hidden = !rival;
  if (rival) setMeter('rival-health', rival.health, rival.maxHealth);
  const weapon = getWeapon(player.weaponId);
  setText('hud-weapon', weapon.name);
  setText('hud-weapon-detail', `${weapon.era} · ${weapon.weight} kg`);
  const inventory = arena ? '' : `${player.inventory.join(',')}:${weapon.id}`;
  if (inventory !== lastInventory) {
    const row = element('hud-inventory');
    row.replaceChildren();
    if (!arena) player.inventory.forEach((weaponId, index) => {
      const slot = document.createElement('kbd');
      slot.textContent = index + 1;
      slot.title = getWeapon(weaponId).name;
      slot.classList.toggle('equipped', weaponId === weapon.id);
      row.append(slot);
    });
    lastInventory = inventory;
  }
  const pickup = arena ? null : nearbyPickup(match);
  let message = now < noticeUntil ? notice : '';
  if (!player.alive && !arena && match.status === 'playing') message = `Returning to your fort in ${Math.ceil(player.respawnAt - match.time)}s`;
  else if (!message && pickup) {
    const item = pickup.weaponId ? getWeapon(pickup.weaponId).name : pickup.item === 'medkit' ? 'Medkit' : 'Stamina Tonic';
    message = `[E] Pick up ${item}`;
  }
  if (now - lastLookAt > 23000 && !isCapturing() && !message && isOnline()) message = 'Click the arena to capture the mouse';
  setText('hud-message', message);
  setText('hud-seed', `SEED ${world.seed}`);
  setText('hud-controls', arena
    ? 'WASD Move · Flick Mouse to Swing · RMB Guard'
    : 'WASD Move · Flick Mouse to Swing · RMB Guard · E Pick up · V Camera');
  element('hud-reticle').classList.toggle('guarding', player.guarding);
  drawMap(world, player);
}

function mapPosition(world, x, z) {
  const width = minimap.width - 12;
  return [6 + (x / world.size + 0.5) * width, 6 + (z / world.size + 0.5) * width];
}

function drawMapBase(world) {
  if (!mapBase) return;
  const width = mapLayer.width - 12;
  mapBase.fillStyle = '#19211e';
  mapBase.fillRect(0, 0, mapLayer.width, mapLayer.height);
  const resolution = 41;
  const size = width / resolution;
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const x = world.size * ((column + 0.5) / resolution - 0.5);
      const z = world.size * ((row + 0.5) / resolution - 0.5);
      const region = world.regionAt(x, z);
      const height = world.height(x, z);
      mapBase.fillStyle = height > 4 ? region.groundLight : region.ground;
      mapBase.fillRect(6 + column * size, 6 + row * size, Math.ceil(size), Math.ceil(size));
    }
  }
}

function drawMap(world, player) {
  if (!mapContext) return;
  mapContext.drawImage(mapLayer, 0, 0);
  for (const core of match.cores) {
    const [x, y] = mapPosition(world, core.x, core.z);
    mapContext.fillStyle = core.health <= 0 ? '#303735' : core.team ? '#ff946e' : '#8ff9d1';
    mapContext.fillRect(x - 3, y - 3, 6, 6);
    mapContext.strokeStyle = '#202620';
    mapContext.strokeRect(x - 4, y - 4, 8, 8);
  }
  for (const actor of match.actors) {
    if (!actor.alive || actor === player) continue;
    const [x, y] = mapPosition(world, actor.x, actor.z);
    mapContext.fillStyle = '#ffd0b0';
    mapContext.fillRect(x - 2, y - 2, 4, 4);
  }
  const [x, y] = mapPosition(world, player.x, player.z);
  mapContext.save();
  mapContext.translate(x, y);
  mapContext.rotate(-view.yaw);
  mapContext.beginPath();
  mapContext.moveTo(0, 6);
  mapContext.lineTo(-4, -4);
  mapContext.lineTo(4, -4);
  mapContext.closePath();
  mapContext.fillStyle = '#fff9db';
  mapContext.strokeStyle = '#1e2422';
  mapContext.lineWidth = 2;
  mapContext.stroke();
  mapContext.fill();
  mapContext.restore();
}

function finish() {
  unlockPointer();
  releaseInput();
  close(controlsDialog);
  close(pauseDialog);
  let status = match.status;
  if (networkRole === 'guest' && status !== 'draw') status = status === 'won' ? 'lost' : 'won';
  const arena = match.world.mode === 'arena';
  const titles = arena ? { won: 'Duel won', lost: 'Duel lost', draw: 'Draw' }
    : { won: 'Frontier secured', lost: 'Your core fell' };
  const notes = arena
    ? { won: 'You defeated your challenger.', lost: 'Your challenger won this round.', draw: 'Both fighters fell.' }
    : { won: 'Your stronghold held and all rival cores fell.', lost: 'Rivals destroyed your stronghold’s core.' };
  setText('end-title', titles[status]);
  setText('end-note', notes[status]);
  element('replay').hidden = isOnline();
  modal(endDialog);
}

function sendSnapshot() {
  network?.send({
    type: 'snapshot', time: match.time, status: match.status, actors: match.actors,
  });
}

function applyOnlineMessage(message) {
  if (networkRole === 'host' && message.type === 'input' && message.input && typeof message.input === 'object') {
    const from = message.input;
    remoteInput = {
      moveX: from.moveX, moveZ: from.moveZ, facing: from.facing,
      aimX: from.aimX, aimY: from.aimY, guard: from.guard === true, sprint: from.sprint === true,
    };
    if (from.guard === true) guestSwing = undefined;
    else if (from.attack === true && Number.isFinite(from.attackX) && Number.isFinite(from.attackY)) {
      guestSwing ??= { attack: true, attackX: from.attackX, attackY: from.attackY };
    }
    remoteInputAt = performance.now();
  } else if (networkRole === 'guest') {
    if (message.type === 'start' && !match && typeof message.seed === 'string' && /^[A-Z\d]{1,12}$/.test(message.seed)) {
      startMatch('arena', { worldSeed: message.seed, arenaWeapon: message.weapon, online: true });
    } else if (message.type === 'snapshot' && match && match.status === 'playing') {
      const { actors, time, status } = message;
      if (!Array.isArray(actors) || actors.length !== 2 || !Number.isFinite(time) || time < match.time
          || !['playing', 'won', 'lost', 'draw'].includes(status)
          || actors.some((actor, index) => !actor || actor.id !== match.actors[index].id
            || !['x', 'z', 'facing', 'health', 'stamina', 'maxHealth', 'maxStamina'].every((key) => Number.isFinite(actor[key])))) return;
      match.actors = actors;
      match.player = actors[0];
      match.rival = actors[1];
      match.time = time;
      match.status = status;
    }
  }
}

function onlineStatus(status, detail) {
  if (status === 'connected') {
    if (networkRole === 'host' && !match) {
      const worldSeed = seed();
      const arenaWeapon = weaponSelect.value;
      if (startMatch('arena', { worldSeed, arenaWeapon, online: true })) {
        network.send({ type: 'start', seed: worldSeed, weapon: arenaWeapon });
        flash('Friend connected. Click to capture the mouse.');
      }
    } else if (match) {
      flash('Arena connection restored');
    } else {
      setText('network-status', 'Connected. Waiting for the host to start…');
    }
  } else if (status === 'disconnected' || status === 'failed') {
    const message = detail || 'Your opponent disconnected. You can return to the main menu and start a new invite.';
    if (match) flash(message);
    else setText('network-status', message);
  } else if (status === 'gathering') {
    setText('network-status', 'Preparing connection details…');
  } else if (status === 'connecting') {
    setText('network-status', 'Connecting to your friend…');
  } else if (status === 'waiting' && detail && !match) {
    setText('network-status', detail);
    element('network-input-field').hidden = false;
  }
}

async function openNetwork(role, transport) {
  disconnect();
  networkRole = role;
  element('network-panel').hidden = false;
  element('network-output-field').hidden = true;
  element('network-input-field').hidden = role === 'host';
  networkInput.value = '';
  networkOutput.value = '';
  networkConnect.disabled = false;
  setText('network-input-label', role === 'host' ? 'Friend’s response code' : 'Friend’s invite code');
  setText('network-connect', role === 'host' ? 'Connect' : 'Create a response');
  try {
    const create = role === 'host' ? createHostSession : createGuestSession;
    const session = create({ transport, onMessage: applyOnlineMessage, onStatus: onlineStatus });
    network = session;
    if (role === 'host') {
      const code = await session.createInvite();
      if (network !== session) return;
      networkOutput.value = code;
      setText('network-output-label', 'Invite code to send');
      setText('network-status', transport === 'local'
        ? 'Open this page in another tab, select Join a friend, and exchange the codes.'
        : 'Send the invite code to your friend, then paste the response they send back.');
      element('network-output-field').hidden = false;
      element('network-input-field').hidden = false;
    } else {
      setText('network-status', 'Paste the invite code your friend sent you.');
      networkInput.focus();
    }
  } catch (error) {
    if (networkRole === role && arenaDialog.open) setText('network-status', error.message);
  }
}

element('host-match').addEventListener('click', () => openNetwork('host'));
element('join-match').addEventListener('click', () => openNetwork('guest'));
element('local-match').addEventListener('click', () => openNetwork('host', 'local'));
networkConnect.addEventListener('click', async () => {
  if (!network) return;
  const session = network;
  networkConnect.disabled = true;
  try {
    if (networkRole === 'host') {
      await session.acceptAnswer(networkInput.value);
    } else {
      const code = await session.acceptInvite(networkInput.value);
      if (network !== session) return;
      networkOutput.value = code;
      setText('network-output-label', 'Response code to send');
      setText('network-status', 'Send this response to your friend. The duel starts when they apply it.');
      element('network-output-field').hidden = false;
    }
    if (network === session) element('network-input-field').hidden = true;
  } catch (error) {
    if (network === session) setText('network-status', error.message);
  } finally {
    if (network === session) networkConnect.disabled = false;
  }
});
element('network-copy').addEventListener('click', async () => {
  const button = element('network-copy');
  try {
    await navigator.clipboard.writeText(networkOutput.value);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy code'; }, 1200);
  } catch {
    networkOutput.select();
    setText('network-status', 'Code selected. Copy it with Ctrl+C or Command+C.');
  }
});
arenaDialog.addEventListener('close', () => {
  if (!isOnline() && !matchStarting) disconnect();
});
