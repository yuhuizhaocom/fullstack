import type { Metadata, Viewport } from "next";

import { Tve4Game } from "@/components/tve4/game";

export const metadata: Metadata = {
  title: "巨魔 VS 精灵 · tve4",
  description: "从零重写的浏览器对战游戏，Phaser 4 + 原创素材",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#07100b",
};

export default function Tve4Page() {
  return <Tve4Game />;
}
