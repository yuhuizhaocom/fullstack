import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";

import { PixelRpg } from "@/components/game/pixel-rpg";

export const metadata: Metadata = {
  title: "像素冒险",
};

export default function GamePage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">像素冒险</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            无需登录的回合制像素 RPG：职业、装备、技能、宠物、副本与 BOSS
          </p>
        </div>
        <Link
          href="/world"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-amber-500 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-500/20"
        >
          <Gamepad2 className="size-4" />
          进入开放世界（实时组队）
        </Link>
      </div>
      <PixelRpg />
    </div>
  );
}
