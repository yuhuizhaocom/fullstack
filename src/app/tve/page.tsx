import type { Metadata, Viewport } from "next";

import { TveGame } from "@/components/tve/tve-game";

export const metadata: Metadata = {
  title: "巨魔 VS 精灵",
  description: "双阵营单机对抗：精灵守家发育，巨魔夜袭拆树，移动端触屏适配。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b1410",
};

export default function TvePage() {
  return <TveGame />;
}
