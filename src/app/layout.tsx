import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TaskFlow · 全栈任务管理台",
    template: "%s · TaskFlow",
  },
  description:
    "基于 Next.js、TypeScript、Tailwind CSS、shadcn/ui、Prisma 与 PostgreSQL 的全栈任务管理系统示例。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans">
        <AppShell>{children}</AppShell>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
