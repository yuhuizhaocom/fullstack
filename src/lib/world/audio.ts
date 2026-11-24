type SfxKind =
  | "attack"
  | "hurt"
  | "kill"
  | "skill"
  | "heal"
  | "levelup"
  | "death"
  | "pickup";

let ctx: AudioContext | null = null;
let bgmTimer: number | null = null;
let bgmStep = 0;

export function initAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  slideTo?: number
): void {
  const audio = ctx;
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
  }
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSfx(kind: SfxKind): void {
  if (!initAudio()) return;
  switch (kind) {
    case "attack":
      beep(340, 0.07, "square", 0.04, 140);
      break;
    case "hurt":
      beep(170, 0.13, "sawtooth", 0.045, 80);
      break;
    case "kill":
      beep(520, 0.1, "square", 0.045);
      setTimeout(() => beep(780, 0.14, "square", 0.04), 80);
      break;
    case "skill":
      beep(420, 0.2, "triangle", 0.05, 900);
      break;
    case "heal":
      beep(660, 0.16, "sine", 0.055, 990);
      break;
    case "levelup":
      [523, 659, 784, 1046].forEach((freq, index) =>
        setTimeout(() => beep(freq, 0.15, "square", 0.045), index * 90)
      );
      break;
    case "death":
      beep(220, 0.45, "sawtooth", 0.05, 55);
      break;
    case "pickup":
      beep(880, 0.06, "square", 0.035);
      break;
  }
}

const MELODY: (number | null)[] = [
  262, 330, 392, 330, 294, 349, 440, 349, 262, 330, 392, 523, 440, 392, 330, 262,
  220, 262, 330, 262, 196, 247, 294, 247, 220, 262, 330, 392, 330, 294, 262, null,
];

export function isBgmPlaying(): boolean {
  return bgmTimer !== null;
}

export function startBgm(): void {
  const audio = initAudio();
  if (!audio || bgmTimer !== null) return;
  bgmStep = 0;
  bgmTimer = window.setInterval(() => {
    const note = MELODY[bgmStep % MELODY.length];
    bgmStep += 1;
    if (note) beep(note, 0.2, "triangle", 0.016);
    if (bgmStep % 8 === 0) beep(note ? note / 2 : 130, 0.16, "sine", 0.018);
  }, 280);
}

export function stopBgm(): void {
  if (bgmTimer !== null) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
}
