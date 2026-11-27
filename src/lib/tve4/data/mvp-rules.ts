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
  const indexed = Object.keys(values)
    .filter((key) => key.startsWith(`${prefix}.`))
    .map((key) => ({ index: Number(key.slice(prefix.length + 1)), value: values[key] }))
    .filter((entry) => Number.isInteger(entry.index) && typeof entry.value === "number")
    .sort((a, b) => a.index - b.index);
  const scalar = typeof values[prefix] === "number" ? [{ index: 0, value: values[prefix] }] : [];
  const entries = [...scalar, ...indexed].sort((a, b) => a.index - b.index);
  return entries.map((entry) => Number(entry.value));
}

export function ruleValue(id: string, field: string): string | number | boolean {
  return ruleRecord(id).values[field];
}

export function ruleEvidence(id: string, field: string): CoreRuleSource {
  const record = ruleRecord(id);
  const evidence = record.evidence?.[field];
  const source = Array.isArray(evidence) ? evidence[0] : evidence;
  if (!source) throw new Error(`Missing MVP evidence: ${id}.${field}`);
  return source;
}
