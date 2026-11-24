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
          实时多人 · 自动组队 · 共享角色存档 · 音效与背景音乐
        </p>
      </div>
      <WorldGame />
    </div>
  );
}
