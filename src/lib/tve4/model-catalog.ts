import type { ModelGroup } from "../tve4-model-demo/catalog";
import type { ModelDemoEntry } from "../tve4-model-demo/manifest";
import type { ActionKey } from "../tve4-model-demo/sequences";
import type { Faction } from "./types";

const COMPLETE_ACTIONS: ActionKey[] = ["stand", "walk", "attack", "death"];

export async function loadHeroModelManifest(): Promise<ModelDemoEntry[]> {
  const response = await fetch("/tve4-model-demo/manifest.json");
  if (!response.ok) throw new Error(`模型清单加载失败：HTTP ${response.status}`);
  const value = await response.json() as { models?: unknown };
  if (!Array.isArray(value.models)) throw new Error("模型清单格式无效");
  return value.models as ModelDemoEntry[];
}

export function heroModelsForFaction(models: ModelDemoEntry[], faction: Faction): ModelDemoEntry[] {
  return models
    .filter((entry) => entry.group === (faction as ModelGroup))
    .filter((entry) => faction === "troll" || (entry.id !== "m020" && hasAvailableTexture(entry)))
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