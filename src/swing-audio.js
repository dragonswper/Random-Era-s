import { CombatTuning } from './combat.js';

export function createSwingAudio() {
  let context;
  let noise;
  let volume = 1;

  function unlock() {
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context ??= new AudioContext();
      if (context.state !== 'running') context.resume().catch(() => {});
    } catch {
      // Audio can be unavailable even when the rest of the game is playable.
    }
  }

  function play(velocity) {
    if (context?.state !== 'running' || !volume) return;
    if (!noise) {
      noise = context.createBuffer(1, Math.round(context.sampleRate * 0.24), context.sampleRate);
      const samples = noise.getChannelData(0);
      let air = 0;
      for (let index = 0; index < samples.length; index++) {
        air = air * 0.55 + (Math.random() * 2 - 1) * 0.45;
        const envelope = Math.sin(Math.PI * (index / samples.length) ** 0.8) ** 2;
        samples[index] = air * envelope;
      }
    }

    const speed = Math.max(1, Math.min(4, velocity / CombatTuning.MinFlickVelocity));
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise;
    // Playback rate shifts the pitch and duration together for a faster cut.
    source.playbackRate.value = 0.86 + (speed - 1) * 0.23;
    filter.type = 'bandpass';
    filter.frequency.value = 1100 + speed * 210;
    filter.Q.value = 0.62;
    gain.gain.value = 0.26 * volume;
    source.connect(filter).connect(gain).connect(context.destination);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  return { unlock, play, setVolume(value) { volume = value; } };
}
