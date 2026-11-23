"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodo } from "lucide-react";

import { isNavActive, navItems } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
        <ListTodo className="size-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold leading-none tracking-tight">
          TaskFlow
        </span>
        <span className="mt-1 text-[11px] leading-none text-muted-foreground">
          全栈任务管理台
        </span>
      </span>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {active && <span className="size-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-background lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          导航
        </p>
        <SidebarNav />
      </div>
      <div className="border-t p-4">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs font-medium">技术栈</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Next.js · TypeScript · Prisma
            <br />
            PostgreSQL · Tailwind · shadcn/ui
          </p>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">TaskFlow v0.1.0</p>
      </div>
    </aside>
  );
}

export function SidebarSheetContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center pr-8">
        <Brand />
      </div>
      <div className="mt-4 flex-1">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <p className="text-[11px] text-muted-foreground">TaskFlow v0.1.0</p>
    </div>
  );
}
