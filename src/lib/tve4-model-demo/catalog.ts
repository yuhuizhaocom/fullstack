export const MODEL_GROUP_ORDER = [
  "troll",
  "elf",
  "other-characters",
  "buildings",
  "environment",
  "effects-ui",
] as const;

export type ModelGroup = (typeof MODEL_GROUP_ORDER)[number];

export const MODEL_GROUP_LABELS: Record<ModelGroup, string> = {
  troll: "巨魔",
  elf: "精灵",
  "other-characters": "中立/其他人物",
  buildings: "建筑",
  environment: "环境",
  "effects-ui": "特效/界面",
};

export interface ModelCandidate {
  number: number;
  id: string;
  label: string;
  source: string;
  group: ModelGroup;
}

export function buildCatalog(groups: Record<ModelGroup, readonly string[]>): ModelCandidate[] {
  const seen = new Set<string>();
  const catalog: ModelCandidate[] = [];
  for (const group of MODEL_GROUP_ORDER) {
    for (const source of groups[group]) {
      const normalized = source.replace(/\\/g, "/").toLowerCase();
      if (seen.has(normalized)) throw new Error(`duplicate model: ${source}`);
      seen.add(normalized);
      const number = catalog.length + 1;
      const cleanSource = source.replace(/\\/g, "/");
      const file = cleanSource.split("/").pop() ?? cleanSource;
      catalog.push({
        number,
        id: `m${String(number).padStart(3, "0")}`,
        label: file.replace(/\.mdx$/i, ""),
        source: cleanSource,
        group,
      });
    }
  }
  return catalog;
}
