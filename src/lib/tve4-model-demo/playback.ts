import type { DemoSequence } from "./sequences";

export function clampFrame(frame: number, sequence: DemoSequence): number {
  return Math.min(sequence.end, Math.max(sequence.start, frame));
}

export function advanceFrame(
  frame: number,
  deltaMs: number,
  speed: number,
  sequence: DemoSequence,
): { frame: number; ended: boolean } {
  const duration = sequence.end - sequence.start;
  const next = frame + Math.max(0, deltaMs) * speed;
  if (!sequence.nonLooping) {
    const offset = (next - sequence.start) % duration;
    return { frame: sequence.start + (offset < 0 ? offset + duration : offset), ended: false };
  }
  if (next >= sequence.end) return { frame: sequence.end, ended: true };
  return { frame: next, ended: false };
}
