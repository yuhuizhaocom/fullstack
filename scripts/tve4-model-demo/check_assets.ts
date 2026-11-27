import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { parseMDX } from "war3-model";

import { decodeBlpMipmaps } from "../../src/lib/tve4-model-demo/blp";
import { buildCatalog, MODEL_GROUP_LABELS, MODEL_GROUP_ORDER } from "../../src/lib/tve4-model-demo/catalog";
import { buildManifestEntry, type ModelDemoEntry } from "../../src/lib/tve4-model-demo/manifest";

const root = process.cwd();
const assetRoot = join(root, "public", "tve4-model-demo");
const groups = JSON.parse(readFileSync(join(root, "scripts", "tve4-model-demo", "groups.json"), "utf8")) as Parameters<typeof buildCatalog>[0];
const candidates = buildCatalog(groups);
const warnings: string[] = [];

function readArrayBuffer(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const models = candidates.map((candidate): ModelDemoEntry => {
  const prefix = String(candidate.number).padStart(3, "0");
  const modelFile = `models/${prefix}-${basename(candidate.source)}`;
  const absolutePath = join(assetRoot, modelFile);
  const base = {
    id: candidate.id,
    number: candidate.number,
    group: candidate.group,
    label: candidate.label,
    sourceFile: candidate.source,
    modelFile,
    modelUrl: `/tve4-model-demo/${modelFile}`,
    sha256: sha256(absolutePath),
  };

  let model: ReturnType<typeof parseMDX>;
  try {
    model = parseMDX(readArrayBuffer(absolutePath));
  } catch (error) {
    return {
      ...base,
      version: 0,
      geometryCount: 0,
      boneCount: 0,
      sequences: [],
      actions: {},
      textures: [],
      events: [],
      parseError: error instanceof Error ? error.message : String(error),
    };
  }

  const textureRoot = join(assetRoot, "textures", prefix);
  const textureFiles = walk(textureRoot)
    .map((path) => {
      const relativePath = relative(textureRoot, path).replace(/\\/g, "/");
      const convertedTga = relativePath.toLowerCase().endsWith(".png") &&
        existsSync(join(textureRoot, relativePath.replace(/\.png$/i, ".tga")));
      const sourcePath = convertedTga ? relativePath.replace(/\.png$/i, ".tga") : relativePath;
      return {
        file: `textures/${prefix}/${relativePath}`,
        url: `/tve4-model-demo/textures/${prefix}/${relativePath}`,
        sourcePath,
      };
    })
    .filter((texture) => {
      if (texture.file.toLowerCase().endsWith(".tga")) return false;
      if (!texture.file.toLowerCase().endsWith(".blp")) return true;
      try {
        decodeBlpMipmaps(readArrayBuffer(join(assetRoot, texture.file)));
        return true;
      } catch (error) {
        warnings.push(`${texture.file}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    });

  const entry = buildManifestEntry({
    ...base,
    textureFiles,
    allowEmptyGeometry: candidate.group === "effects-ui",
    allowEmptySequences: candidate.group === "effects-ui",
    skipInvalidSequences: candidate.group === "effects-ui",
    model,
  });

  const ordered = [...entry.sequences].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].start < ordered[i - 1].end) {
      warnings.push(`${modelFile}: overlapping sequences ${ordered[i - 1].name} and ${ordered[i].name}`);
    }
  }

  return entry;
});

const manifest = {
  generatedFrom: "92321DFF967C964EC7EB7EE52A91A7A4.w3x",
  models,
};

writeFileSync(join(assetRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
for (const group of MODEL_GROUP_ORDER) {
  const entries = models.filter((model) => model.group === group);
  const available = entries.reduce((total, model) => total + model.textures.filter((texture) => texture.status === "available").length, 0);
  console.log(`${MODEL_GROUP_LABELS[group]}: ${entries.length} models, ${available} available textures`);
}
console.log(`manifest written: public/tve4-model-demo/manifest.json (${models.length} models)`);
for (const warning of warnings) console.log(`warning: ${warning}`);
