import Link from "next/link";
import {
  ClipboardList,
  Gamepad2,
  ListTodo,
  MessageSquare,
  Paperclip,
  Swords,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth/session";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <ListTodo className="size-4" />
            </span>
            <span className="text-sm font-semibold">
              TaskFlow
              <span className="hidden sm:inline"> 公开区</span>
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-xs text-muted-foreground">
            <Link
              href="/chat"
              title="聊天室"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <MessageSquare className="size-3.5" />
              <span className="hidden sm:inline">聊天室</span>
            </Link>
            <Link
              href="/files"
              title="附件分享"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Paperclip className="size-3.5" />
              <span className="hidden sm:inline">附件</span>
            </Link>
            <Link
              href="/clip"
              title="临时剪贴板"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <ClipboardList className="size-3.5" />
              <span className="hidden sm:inline">剪贴板</span>
            </Link>
            <Link
              href="/world"
              title="开放世界"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Gamepad2 className="size-3.5" />
              <span className="hidden sm:inline">开放世界</span>
            </Link>
            <Link
              href="/hunter"
              title="猎人与农民"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Swords className="size-3.5" />
              <span className="hidden sm:inline">猎人与农民</span>
            </Link>
            <Link
              href="/tve4"
              title="巨魔VS精灵"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Swords className="size-3.5" />
              <span className="hidden sm:inline">巨魔VS精灵</span>
            </Link>
            <span className="h-3 w-px bg-border" />
            {user ? (
              <Link href="/" className="font-medium hover:text-foreground">
                返回工作台
              </Link>
            ) : (
              <Link href="/login" className="font-medium hover:text-foreground">
                登录
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>

      <footer className="pb-5 text-center text-[11px] text-muted-foreground">
        公开功能 · 无需登录 · 附件保留 24 小时，聊天记录 7 天，剪贴板内容 24 小时后自动清理
      </footer>
    </div>
  );
}
