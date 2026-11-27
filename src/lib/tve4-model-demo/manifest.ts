import type { ModelGroup } from "./catalog";
import { classifySequence, findActionSequence, sequenceDurationMs, toDemoSequences, type ActionKey, type DemoSequence, type SequenceKind } from "./sequences";

export interface ManifestModel {
  Version: number;
  Geosets: readonly unknown[];
  Bones: readonly unknown[];
  Sequences: readonly { Name: string; Interval: readonly number[]; NonLooping: boolean; MoveSpeed: number }[];
  Textures: readonly { Image: string; ReplaceableId?: number }[];
  EventObjects: readonly { Name: string; EventTrack: readonly number[] | Uint32Array }[];
}

export interface ManifestSequence extends DemoSequence {
  kind: SequenceKind | null;
  duration: number;
}

export interface ManifestTexture {
  image: string;
  replaceableId: number;
  status: "available" | "missing" | "replaceable";
  url: string | null;
  file: string | null;
}

export interface ManifestEvent {
  name: string;
  times: number[];
}

export interface ModelDemoEntry {
  id: string;
  number: number;
  group: ModelGroup;
  label: string;
  sourceFile: string;
  modelFile: string;
  modelUrl: string;
  sha256: string;
  version: number;
  geometryCount: number;
  boneCount: number;
  sequences: ManifestSequence[];
  actions: Partial<Record<ActionKey, { index: number; proxy: boolean }>>;
  textures: ManifestTexture[];
  events: ManifestEvent[];
  parseError?: string;
}

interface ManifestInput {
  id: string;
  number: number;
  group: ModelGroup;
  label: string;
  sourceFile: string;
  modelFile: string;
  modelUrl: string;
  sha256: string;
  textureFiles: readonly { file: string; url: string; sourcePath?: string }[];
  allowEmptyGeometry?: boolean;
  allowEmptySequences?: boolean;
  skipInvalidSequences?: boolean;
  model: ManifestModel;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function basename(path: string): string {
  return normalizePath(path).split("/").pop() ?? "";
}

export function buildManifestEntry(input: ManifestInput): ModelDemoEntry {
  if (![800, 900, 1000, 1100].includes(input.model.Version)) {
    throw new Error(`${input.modelFile}: unsupported MDX version ${input.model.Version}`);
  }
  if (!input.allowEmptyGeometry && input.model.Geosets.length === 0) throw new Error(`${input.modelFile}: no geosets`);
  if (!input.allowEmptyGeometry && input.model.Bones.length === 0) throw new Error(`${input.modelFile}: no bones`);
  const sourceSequences = input.skipInvalidSequences
    ? input.model.Sequences.filter((sequence) => sequence.Interval[1] > sequence.Interval[0])
    : input.model.Sequences;
  if (sourceSequences.length === 0 && !input.allowEmptySequences) throw new Error(`${input.modelFile}: no sequences`);

  const sequences = toDemoSequences(sourceSequences);
  for (const sequence of sequences) {
    if (!Number.isFinite(sequence.start) || !Number.isFinite(sequence.end) || sequence.end <= sequence.start) {
      throw new Error(`${input.modelFile}: invalid interval for ${sequence.name}`);
    }
  }

  const actions: ModelDemoEntry["actions"] = {};
  for (const action of ["stand", "walk", "attack", "death"] as const) {
    const match = findActionSequence(sequences, action);
    if (match) actions[action] = match;
  }

  const textures = input.model.Textures.map((texture): ManifestTexture => {
    const replaceableId = texture.ReplaceableId ?? 0;
    if (!texture.Image) {
      return { image: "", replaceableId, status: "replaceable", url: null, file: null };
    }
    const match =
      input.textureFiles.find((candidate) => candidate.sourcePath && normalizePath(candidate.sourcePath) === normalizePath(texture.Image)) ??
      input.textureFiles.find((candidate) => basename(candidate.file) === basename(texture.Image));
    return {
      image: texture.Image,
      replaceableId,
      status: match ? "available" : "missing",
      url: match?.url ?? null,
      file: match?.file ?? null,
    };
  });

  return {
    id: input.id,
    number: input.number,
    group: input.group,
    label: input.label,
    sourceFile: input.sourceFile,
    modelFile: input.modelFile,
    modelUrl: input.modelUrl,
    sha256: input.sha256,
    version: input.model.Version,
    geometryCount: input.model.Geosets.length,
    boneCount: input.model.Bones.length,
    sequences: sequences.map((sequence) => ({
      ...sequence,
      kind: classifySequence(sequence.name),
      duration: sequenceDurationMs(sequence),
    })),
    actions,
    textures,
    events: input.model.EventObjects.map((event) => ({ name: event.Name, times: Array.from(event.EventTrack) })),
  };
}
