export const DEFAULT_KEYS = Object.freeze({
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', pickup: 'KeyE',
});

const DEFAULT_SETTINGS = Object.freeze({
  quality: 'medium', resolution: 1, fps: '0', master: 0.85, effects: 0.9,
  sensitivity: 1, swingDistance: 1, attackInput: 'swipe', invert: false, frontierView: 'first-person', minimap: true,
  terrainOverlay: 'biome', counters: false, uiScale: 1, contrast: false,
  reticleTheme: 'default', reducedMotion: false, captions: false,
  playerName: 'Wanderer', weapon: 'steel-longsword', theme: 'ironwood', keys: DEFAULT_KEYS,
});

const CHOICES = {
  quality: ['low', 'medium', 'high', 'ultra'], fps: ['30', '60', '120', '0'],
  attackInput: ['swipe', 'click'],
  frontierView: ['first-person', 'third-person'], terrainOverlay: ['biome', 'height', 'slope', 'scatter', 'cores', 'paths'],
  reticleTheme: ['default', 'blue'], weapon: ['steel-longsword', 'knight-dagger'],
};

const RANGES = {
  resolution: [0.5, 1], master: [0, 1], effects: [0, 1],
  sensitivity: [0.35, 2.5], swingDistance: [1, 2], uiScale: [0.9, 1.3],
};

export function createSettingsStore() {
  const saveKey = 'random-eras.settings.v2';
  const state = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
  const listeners = new Set();

  function assign(key, value) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) return false;
    if (CHOICES[key] && !CHOICES[key].includes(value)) return false;
    if (RANGES[key]) {
      const [min, max] = RANGES[key];
      const number = Number(value);
      if (!Number.isFinite(number)) return false;
      value = Math.max(min, Math.min(max, number));
    }
    if (typeof DEFAULT_SETTINGS[key] === 'boolean' && typeof value !== 'boolean') return false;
    if (key === 'playerName') value = String(value).trim().slice(0, 20) || DEFAULT_SETTINGS.playerName;
    if (key === 'theme' && (typeof value !== 'string' || !/^[a-z]+$/.test(value))) return false;
    if (key === 'keys') {
      if (!value || typeof value !== 'object') return false;
      value = Object.fromEntries(Object.entries(DEFAULT_KEYS).map(([action, code]) =>
        [action, typeof value[action] === 'string' && /^[A-Za-z0-9]+$/.test(value[action]) ? value[action] : code]));
    }
    state[key] = value;
    return true;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(saveKey));
    for (const [key, value] of Object.entries(saved || {})) assign(key, value);
  } catch {
    // Private browsing and restrictive storage policies still allow session settings.
  }

  return {
    state,
    set(key, value) {
      if (!assign(key, value)) return;
      try { localStorage.setItem(saveKey, JSON.stringify(state)); } catch { /* Session settings are retained. */ }
      for (const listener of listeners) listener(key, state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function keyLabel(code) {
  return code.replace(/^Key|^Digit/, '').replace(/^Arrow/, '').replace(/Left$|Right$/, '').trim() || code;
}
