import Link from "next/link";
import { ListTodo } from "lucide-react";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/clip" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <ListTodo className="size-4" />
            </span>
            <span className="text-sm font-semibold">TaskFlow 剪贴板</span>
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            登录
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="pb-5 text-center text-[11px] text-muted-foreground">
        公开频道 · 无需登录 · 内容 24 小时后自动清理
      </footer>
    </div>
  );
}
