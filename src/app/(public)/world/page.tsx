import type { Metadata } from "next";

import { WorldGame } from "@/components/world/world-game";

export const metadata: Metadata = {
  title: "开放世界",
};

export default function WorldPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">开放世界</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          实时多人开放世界 · 副本传送门 · NPC 任务 · 洛式装备与 QWER 技能
        </p>
      </div>
      <WorldGame />
    </div>
  );
}
