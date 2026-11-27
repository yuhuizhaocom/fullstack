import type { ModelDemoEntry } from "../tve4-model-demo/manifest";
import type { ActionKey } from "../tve4-model-demo/sequences";
import type { Faction } from "./types";

const COMPLETE_ACTIONS: ActionKey[] = ["stand", "walk", "attack", "death"];
const ELF_MODEL_IDS = new Set(["m022", "m024", "m025", "m027", "m028", "m029"]);
const TROLL_MODEL_IDS = new Set(["m004", "m005", "m015", "m016", "m017"]);
const OTHER_ELF_MODEL_IDS = new Set(["m042", "m044", "m045", "m047", "m048", "m049", "m050", "m051", "m054", "m055", "m056"]);
const OTHER_TROLL_MODEL_IDS = new Set(["m036", "m040"]);

export async function loadHeroModelManifest(): Promise<ModelDemoEntry[]> {
  const response = await fetch("/tve4-model-demo/manifest.json");
  if (!response.ok) throw new Error(`模型清单加载失败：HTTP ${response.status}`);
  const value = await response.json() as { models?: unknown };
  if (!Array.isArray(value.models)) throw new Error("模型清单格式无效");
  return value.models as ModelDemoEntry[];
}

export function heroModelsForFaction(models: ModelDemoEntry[], faction: Faction): ModelDemoEntry[] {
  return models
    .filter((entry) => faction === "troll"
      ? (entry.group === "troll" && TROLL_MODEL_IDS.has(entry.id))
        || (entry.group === "other-characters" && OTHER_TROLL_MODEL_IDS.has(entry.id))
      : (entry.group === "elf" && ELF_MODEL_IDS.has(entry.id) && hasAvailableTexture(entry))
        || (entry.group === "other-characters" && OTHER_ELF_MODEL_IDS.has(entry.id)))
    .sort((a, b) => a.number - b.number);
}

export function hasCompleteActions(entry: ModelDemoEntry): boolean {
  return COMPLETE_ACTIONS.every((action) => Boolean(entry.actions[action]));
}

export function hasAvailableTexture(entry: ModelDemoEntry): boolean {
  return entry.textures.some((texture) => texture.status === "available" && Boolean(texture.url));
}

export function defaultHeroModel(models: ModelDemoEntry[], faction: Faction): ModelDemoEntry | null {
  const candidates = heroModelsForFaction(models, faction);
  return candidates.find((entry) => hasCompleteActions(entry) && hasAvailableTexture(entry))
    ?? candidates.find(hasCompleteActions)
    ?? candidates[0]
    ?? null;
}

export function actionSequenceIndex(entry: ModelDemoEntry, action: ActionKey): number | null {
  return entry.actions[action]?.index ?? null;
}

export function modelActionFor(
  entry: ModelDemoEntry,
  state: { alive: boolean; moving: boolean; attacking: boolean },
): ActionKey {
  if (!state.alive) return entry.actions.death ? "death" : "stand";
  if (state.moving && entry.actions.walk) return "walk";
  if (state.attacking && entry.actions.attack) return "attack";
  return "stand";
}