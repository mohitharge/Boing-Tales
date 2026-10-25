// Tiny WebAudio synth: every sound effect and the music loop are generated, no asset files.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuffer = null;

const state = {
  sfx: true,
  music: true,
  musicTimer: null,
  step: 0,
  nextTime: 0,
  theme: 'meadow',
};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = state.music ? 0.22 : 0;
  musicBus.connect(master);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

function tone({ freq = 440, to = null, dur = 0.15, type = 'sine', vol = 0.3, delay = 0, bus = sfxBus, attack = 0.005 }) {
  if (!ctx || (bus === sfxBus && !state.sfx)) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.3, freq = 1200, q = 1, type = 'lowpass', delay = 0, to = null }) {
  if (!ctx || !state.sfx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  jump(stone) {
    if (stone) tone({ freq: 160, to: 260, dur: 0.18, type: 'triangle', vol: 0.35 });
    else tone({ freq: 320, to: 720, dur: 0.16, type: 'sine', vol: 0.3 });
  },
  land(power, stone) {
    const v = Math.min(0.35, power * 0.025);
    if (v < 0.04) return;
    if (stone) noise({ dur: 0.18, vol: v * 1.4, freq: 400, to: 120 });
    else tone({ freq: 180, to: 90, dur: 0.1, type: 'sine', vol: v });
  },
  gem(combo = 0) {
    const base = 880 * Math.pow(2, Math.min(combo, 8) / 12);
    tone({ freq: base, dur: 0.12, type: 'triangle', vol: 0.22 });
    tone({ freq: base * 1.5, dur: 0.22, type: 'triangle', vol: 0.18, delay: 0.06 });
  },
  heart() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.2, delay: i * 0.07 }));
  },
  spring() {
    tone({ freq: 180, to: 1000, dur: 0.35, type: 'sine', vol: 0.32 });
    tone({ freq: 360, to: 1400, dur: 0.3, type: 'triangle', vol: 0.1, delay: 0.02 });
  },
  stomp() {
    tone({ freq: 260, to: 60, dur: 0.18, type: 'square', vol: 0.18 });
    noise({ dur: 0.1, vol: 0.2, freq: 900 });
  },
  hurt() {
    tone({ freq: 520, to: 70, dur: 0.5, type: 'sawtooth', vol: 0.18 });
    noise({ dur: 0.25, vol: 0.25, freq: 2000, to: 200 });
  },
  checkpoint() {
    [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.22, delay: i * 0.09 }));
  },
  transform(stone) {
    noise({ dur: 0.35, vol: 0.3, freq: stone ? 600 : 3000, to: stone ? 100 : 800, type: 'bandpass', q: 2 });
    if (stone) tone({ freq: 140, to: 70, dur: 0.4, type: 'triangle', vol: 0.35 });
    else tone({ freq: 400, to: 1200, dur: 0.3, type: 'sine', vol: 0.25 });
  },
  smash() {
    noise({ dur: 0.45, vol: 0.5, freq: 1800, to: 120 });
    tone({ freq: 110, to: 40, dur: 0.35, type: 'triangle', vol: 0.4 });
  },
  splash() {
    noise({ dur: 0.35, vol: 0.25, freq: 2500, to: 400, type: 'bandpass', q: 0.8 });
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.22, delay: i * 0.1 }),
    );
  },
  click() {
    tone({ freq: 660, to: 880, dur: 0.06, type: 'sine', vol: 0.15 });
  },
};

// ---------- Music: a little chiptune-ish loop per theme ----------
const SONGS = {
  meadow: { bpm: 112, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]] },
  lagoon: { bpm: 100, chords: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]] },
  sunset: { bpm: 120, chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]] },
};
const MELODY = [0, 2, 1, 2, 0, 1, 2, -1, 2, 1, 0, 1, 2, -1, 1, -1];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function scheduleMusic() {
  if (!ctx) return;
  const song = SONGS[state.theme] || SONGS.meadow;
  const stepDur = 60 / song.bpm / 2;
  while (state.nextTime < ctx.currentTime + 0.2) {
    const s = state.step;
    const chord = song.chords[Math.floor(s / 16) % song.chords.length];
    const t = state.nextTime - ctx.currentTime;
    if (s % 4 === 0) tone({ freq: midi(chord[0] - 12), dur: stepDur * 1.8, type: 'triangle', vol: 0.5, delay: t, bus: musicBus });
    if (s % 4 === 2) tone({ freq: midi(chord[0] - 5), dur: stepDur * 0.9, type: 'triangle', vol: 0.3, delay: t, bus: musicBus });
    const m = MELODY[s % 16];
    if (m >= 0) {
      const octave = Math.floor(s / 32) % 2 === 0 ? 12 : 24;
      tone({ freq: midi(chord[m] + octave), dur: stepDur * 0.8, type: 'square', vol: 0.08, delay: t, bus: musicBus, attack: 0.01 });
    }
    if (s % 2 === 1) {
      // soft hi-hat
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      const tt = state.nextTime;
      g.gain.setValueAtTime(0.06, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      src.connect(f).connect(g).connect(musicBus);
      src.start(tt);
      src.stop(tt + 0.06);
    }
    state.step++;
    state.nextTime += stepDur;
  }
}

export function startMusic(theme) {
  if (!ensure()) return;
  state.theme = theme;
  if (state.musicTimer) return;
  state.step = 0;
  state.nextTime = ctx.currentTime + 0.1;
  state.musicTimer = setInterval(scheduleMusic, 50);
}

export function setMusicTheme(theme) {
  state.theme = theme;
}

export function toggleMusic() {
  state.music = !state.music;
  if (musicBus) musicBus.gain.setTargetAtTime(state.music ? 0.22 : 0, ctx.currentTime, 0.1);
  return state.music;
}

export function toggleSound() {
  state.sfx = !state.sfx;
  state.music = state.sfx;
  if (musicBus) musicBus.gain.setTargetAtTime(state.music ? 0.22 : 0, ctx.currentTime, 0.1);
  return state.sfx;
}

export function isMusicOn() {
  return state.music;
}

export function isSoundOn() {
  return state.sfx;
}
