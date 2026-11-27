// Typed access to the source-provenanced OLD + SINGLE MVP whitelist.
// Numeric arrays use explicit indexes (gold.0, gold.1, ...) so every number can
// carry independent evidence instead of inheriting one record-level confidence.
import raw from "../../../../data/tve4/mvp/rules.json";

export type CoreRuleConfidence = "VERIFIED" | "INFERRED" | "UNKNOWN";

export interface CoreRuleSource {
  file: string;
  objectId?: string;
  field?: string;
  level?: number;
  jassLine?: number;
  value?: string | number | boolean;
  priority?: number;
  confidence: CoreRuleConfidence;
}

export interface CoreRuleRecord {
  id: string;
  values: Record<string, string | number | boolean>;
  source: CoreRuleSource;
  evidence?: Record<string, CoreRuleSource | CoreRuleSource[]>;
}

export interface MvpUnknown {
  id: string;
  reason: string;
  blocking: boolean;
}

export interface MvpRules {
  catalogVersion: string;
  primarySource: string;
  heroes: CoreRuleRecord[];
  buildings: CoreRuleRecord[];
  skills: CoreRuleRecord[];
  items: CoreRuleRecord[];
  modeSingle: CoreRuleRecord[];
  unknowns: MvpUnknown[];
}

export const MVP_RULES = raw as unknown as MvpRules;
export const MVP_UNKNOWNS = MVP_RULES.unknowns;

const RECORDS = [
  ...MVP_RULES.modeSingle, ...MVP_RULES.heroes, ...MVP_RULES.buildings,
  ...MVP_RULES.skills, ...MVP_RULES.items,
];

export function ruleRecord(id: string): CoreRuleRecord {
  const record = RECORDS.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Missing MVP core rule: ${id}`);
  return record;
}

export function ruleNumber(id: string, field: string): number {
  const value = ruleRecord(id).values[field];
  if (typeof value !== "number") throw new Error(`MVP rule ${id}.${field} is not numeric`);
  return value;
}

export function ruleNumbers(id: string, prefix: string): number[] {
  const values = ruleRecord(id).values;
  const entries = new Map<number, number>();
  for (const key of Object.keys(values)) {
    if (!key.startsWith(`${prefix}.`)) continue;
    const index = Number(key.slice(prefix.length + 1));
    const value = values[key];
    if (Number.isInteger(index) && typeof value === "number") entries.set(index, value);
  }
  // An explicit index is more specific than the scalar alias for index zero.
  if (typeof values[prefix] === "number" && !entries.has(0)) entries.set(0, values[prefix]);
  return [...entries.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
}

export function ruleValue(id: string, field: string): string | number | boolean {
  return ruleRecord(id).values[field];
}

export function ruleEvidence(id: string, field: string): CoreRuleSource {
  const record = ruleRecord(id);
  const evidence = record.evidence?.[field];
  if (!evidence) throw new Error(`Missing MVP evidence: ${id}.${field}`);
  const layers = Array.isArray(evidence) ? evidence : [evidence];
  return layers.reduce((selected, candidate) =>
    !selected || (candidate.priority ?? 0) > (selected.priority ?? 0) ? candidate : selected,
  );
}
