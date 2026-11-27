import type { Metadata, Viewport } from "next";

import { ModelDemo } from "@/components/tve4-model-demo/model-demo";

export const metadata: Metadata = {
  title: "War3 模型动画验证 · tve4",
  description: "直接加载原版 MDX 模型、贴图与骨骼动画的浏览器 Demo",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#070b0e",
};

export default function Tve4ModelDemoPage() {
  return <ModelDemo />;
}
