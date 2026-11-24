import type { Metadata } from "next";

import { PixelRpg } from "@/components/game/pixel-rpg";

export const metadata: Metadata = {
  title: "像素冒险",
};

export default function GamePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">像素冒险</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          无需登录的回合制像素 RPG：职业、装备、技能、宠物、副本与 BOSS
        </p>
      </div>
      <PixelRpg />
    </div>
  );
}
