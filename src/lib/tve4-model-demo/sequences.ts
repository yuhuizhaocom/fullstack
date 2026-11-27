export type ActionKey = "stand" | "walk" | "attack" | "death";
export type SequenceKind = ActionKey | "spell" | "decay";

export interface DemoSequence {
  name: string;
  start: number;
  end: number;
  nonLooping: boolean;
  moveSpeed: number;
}

export function normalizeSequenceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
}

export function classifySequence(name: string): SequenceKind | null {
  const normalized = normalizeSequenceName(name);
  if (/^stand(?:\s|$|-)/.test(normalized)) return "stand";
  if (/^walk(?:\s|$|-)/.test(normalized)) return "walk";
  if (/(^|\s)attack(?:\s|$|-)/.test(normalized)) return "attack";
  if (/^(death|dissipate)(?:\s|$|-)/.test(normalized)) return "death";
  if (/^decay(?:\s|$|-)/.test(normalized)) return "decay";
  if (/(^|[-\s])spell|spell(?:[-\s]|$)/.test(normalized)) return "spell";
  return null;
}

export function findActionSequence(
  sequences: DemoSequence[],
  action: ActionKey,
): { index: number; proxy: boolean } | null {
  const matches = sequences
    .map((sequence, index) => ({ sequence, index }))
    .filter(({ sequence }) => classifySequence(sequence.name) === action);
  if (matches.length === 0) return null;
  const exact = matches.find(({ sequence }) => normalizeSequenceName(sequence.name) === action);
  const selected = exact ?? matches[0];
  return { index: selected.index, proxy: !exact };
}

export function sequenceDurationMs(sequence: DemoSequence): number {
  return sequence.end - sequence.start;
}

export function eventTimesMs(events: readonly number[], sequenceStart: number, sequenceEnd: number): number[] {
  return [...new Set(events.map((event) => event - sequenceStart).filter((time) => time >= 0 && time <= sequenceEnd - sequenceStart))].sort((a, b) => a - b);
}

export function toDemoSequences(
  sequences: readonly { Name: string; Interval: readonly number[]; NonLooping: boolean; MoveSpeed: number }[],
): DemoSequence[] {
  return sequences.map((sequence) => ({
    name: sequence.Name,
    start: sequence.Interval[0],
    end: sequence.Interval[1],
    nonLooping: sequence.NonLooping,
    moveSpeed: sequence.MoveSpeed,
  }));
}
