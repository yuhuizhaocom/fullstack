// Temporary placeholder icons. Original art is deliberately excluded from this phase.

import type { SkillKey } from "../types";

export interface PlaceholderIcon {
  glyph: string;
  color: string;
  background: string;
}

export const SKILL_ICONS: Record<SkillKey, PlaceholderIcon> = {
  blink: { glyph: "⇢", color: "#bfe9ff", background: "#0c4a6e" },
  haste: { glyph: "≫", color: "#fef08a", background: "#713f12" },
  entangle: { glyph: "✶", color: "#bbf7d0", background: "#14532d" },
  silence: { glyph: "∅", color: "#e9d5ff", background: "#4c1d95" },
  windwalk: { glyph: "≈", color: "#cbd5e1", background: "#334155" },
  berserk: { glyph: "⚔", color: "#fecaca", background: "#7f1d1d" },
  teleport: { glyph: "◎", color: "#bae6fd", background: "#1e3a8a" },
  farSight: { glyph: "◉", color: "#fed7aa", background: "#7c2d12" },
  wallInvuln: { glyph: "▣", color: "#bfe9ff", background: "#0c4a6e" },
};

const ITEM_COLORS = ["#7f1d1d", "#14532d", "#1e3a8a", "#4c1d95", "#713f12", "#334155"];

export function itemIcon(key: string): PlaceholderIcon {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return {
    glyph: "◆",
    color: "#fde68a",
    background: ITEM_COLORS[hash % ITEM_COLORS.length],
  };
}