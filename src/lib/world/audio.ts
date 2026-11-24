type SfxKind =
  | "attack"
  | "hurt"
  | "kill"
  | "skill"
  | "heal"
  | "levelup"
  | "death"
  | "pickup"
  | "quest";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

let bgmTimer: number | null = null;
let bgmStep = 0;
let bgmNextTime = 0;
let bgmPlaying = false;
let noiseBuffer: AudioBuffer | null = null;
let visibilityBound = false;

const BPM = 92;
const STEP_DURATION = 60 / BPM / 2; // 八分音符
const MUSIC_LEVEL = 0.55;

function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 1;
    sfxGain.connect(master);

    // 一个柔和的高频噪声缓冲，用于镲片/打击感
    const length = Math.floor(ctx.sampleRate * 0.2);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
  }

  if (ctx.state === "suspended") void ctx.resume();

  if (!visibilityBound && typeof document !== "undefined") {
    visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      if (!ctx || !bgmPlaying) return;
      if (document.visibilityState === "visible") {
        if (ctx.state === "suspended") void ctx.resume();
        // 后台节流后重新对齐节拍，避免音乐卡死
        bgmNextTime = ctx.currentTime + 0.08;
      }
    });
  }

  return ctx;
}

/** 在用户手势中调用，确保音频上下文被唤醒 */
export function initAudio(): AudioContext | null {
  const audio = ensureAudio();
  if (audio && audio.state === "suspended") void audio.resume();
  return audio;
}

function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType,
  level: number,
  destination: AudioNode,
  slideTo?: number,
  detune = 0
): void {
  const audio = ctx;
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (detune) osc.detune.setValueAtTime(detune, start);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(level, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function hat(start: number, level: number): void {
  const audio = ctx;
  if (!audio || !noiseBuffer || !musicGain) return;
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 6000;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(level, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
  source.connect(filter).connect(gain).connect(musicGain);
  source.start(start);
  source.stop(start + 0.08);
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  slideTo?: number
): void {
  const audio = ctx;
  if (!audio || !sfxGain) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(sfxGain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSfx(kind: SfxKind): void {
  if (!initAudio()) return;
  switch (kind) {
    case "attack":
      beep(360, 0.07, "square", 0.14, 150);
      break;
    case "hurt":
      beep(180, 0.14, "sawtooth", 0.16, 80);
      break;
    case "kill":
      beep(540, 0.1, "square", 0.16);
      setTimeout(() => beep(820, 0.15, "square", 0.14), 75);
      break;
    case "skill":
      beep(420, 0.22, "triangle", 0.18, 940);
      break;
    case "heal":
      beep(680, 0.18, "sine", 0.2, 1020);
      break;
    case "levelup":
      [523, 659, 784, 1046].forEach((freq, index) =>
        setTimeout(() => beep(freq, 0.16, "square", 0.15), index * 90)
      );
      break;
    case "death":
      beep(220, 0.5, "sawtooth", 0.18, 55);
      break;
    case "pickup":
      beep(900, 0.07, "square", 0.12);
      break;
    case "quest":
      [660, 880, 1100].forEach((freq, index) =>
        setTimeout(() => beep(freq, 0.14, "triangle", 0.14), index * 100)
      );
      break;
  }
}

const CHORDS = [
  { bass: 110.0, notes: [220.0, 261.63, 329.63] }, // Am
  { bass: 87.31, notes: [174.61, 220.0, 261.63] }, // F
  { bass: 130.81, notes: [261.63, 329.63, 392.0] }, // C
  { bass: 98.0, notes: [196.0, 246.94, 293.66] }, // G
];

const MELODY: (number | null)[] = [
  659.25, null, 587.33, 523.25, null, 587.33, 659.25, null,
  698.46, null, 659.25, 587.33, null, 523.25, 587.33, null,
  659.25, null, 783.99, 698.46, null, 659.25, 587.33, null,
  523.25, null, 587.33, 659.25, null, 440.0, null, null,
];

function scheduleStep(step: number, time: number): void {
  if (!musicGain || !ctx) return;
  const bar = Math.floor(step / 8) % CHORDS.length;
  const chord = CHORDS[bar];
  const inBar = step % 8;

  if (inBar === 0) {
    // 和弦铺底，柔和铺满整个小节
    chord.notes.forEach((freq) => {
      tone(freq, time, STEP_DURATION * 7.5, "sine", 0.028, musicGain!, undefined, -6);
      tone(freq, time, STEP_DURATION * 7.5, "triangle", 0.016, musicGain!, undefined, 7);
    });
    // 低音
    tone(chord.bass, time, STEP_DURATION * 3.6, "sine", 0.075, musicGain);
    tone(chord.bass / 2, time, STEP_DURATION * 3.4, "triangle", 0.035, musicGain);
  }

  if (inBar === 4) {
    tone(chord.bass, time, STEP_DURATION * 2.6, "sine", 0.055, musicGain);
  }

  const note = MELODY[step % MELODY.length];
  if (note) {
    tone(note, time, STEP_DURATION * 1.7, "triangle", 0.1, musicGain);
    tone(note * 2, time, STEP_DURATION * 0.9, "sine", 0.022, musicGain);
  }

  if (inBar % 2 === 1) hat(time, 0.018);
  if (inBar === 6) hat(time, 0.01);
}

function scheduler(): void {
  const audio = ctx;
  if (!audio || !bgmPlaying) return;
  const horizon = audio.currentTime + 0.3;
  // 弱网/后台节流导致落后过多时重新对齐，避免一次性补放
  if (bgmNextTime < audio.currentTime - 0.5) {
    bgmNextTime = audio.currentTime + 0.05;
  }
  while (bgmNextTime < horizon) {
    scheduleStep(bgmStep, bgmNextTime);
    bgmStep += 1;
    bgmNextTime += STEP_DURATION;
  }
}

export function isBgmPlaying(): boolean {
  return bgmPlaying;
}

export function startBgm(): void {
  const audio = initAudio();
  if (!audio || !musicGain) return;
  if (bgmPlaying) {
    if (musicGain.gain.value < MUSIC_LEVEL * 0.5) {
      musicGain.gain.cancelScheduledValues(audio.currentTime);
      musicGain.gain.setTargetAtTime(MUSIC_LEVEL, audio.currentTime, 0.4);
    }
    return;
  }
  bgmPlaying = true;
  bgmStep = 0;
  bgmNextTime = audio.currentTime + 0.08;
  musicGain.gain.cancelScheduledValues(audio.currentTime);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), audio.currentTime);
  musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL, audio.currentTime + 1.2);
  bgmTimer = window.setInterval(scheduler, 60);
  scheduler();
}

export function stopBgm(): void {
  if (bgmTimer !== null) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
  bgmPlaying = false;
  if (ctx && musicGain) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), ctx.currentTime);
    musicGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
  }
}
