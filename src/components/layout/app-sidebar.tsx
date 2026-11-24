"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodo, LogOut } from "lucide-react";

import { logoutAction } from "@/actions/auth";
import { isNavActive, navItemsFor } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { roleBadgeClass, roleLabels } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

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

function SidebarNav({
  role,
  onNavigate,
}: {
  role: SessionUser["role"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItemsFor(role).map((item) => {
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

function UserCard({ user }: { user: SessionUser }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{user.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user.email}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px]",
            roleBadgeClass[user.role]
          )}
        >
          {roleLabels[user.role]}
        </span>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            退出
          </Button>
        </form>
      </div>
    </div>
  );
}

export function AppSidebar({ user }: { user: SessionUser }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-background lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          导航
        </p>
        <SidebarNav role={user.role} />
      </div>
      <div className="space-y-3 border-t p-4">
        <UserCard user={user} />
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs font-medium">技术栈</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Next.js · TypeScript · Prisma
            <br />
            PostgreSQL · Tailwind · shadcn/ui
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          TaskFlow · 版本 {APP_VERSION}
        </p>
      </div>
    </aside>
  );
}

export function SidebarSheetContent({
  user,
  onNavigate,
}: {
  user: SessionUser;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center pr-8">
        <Brand />
      </div>
      <div className="mt-4 flex-1">
        <SidebarNav role={user.role} onNavigate={onNavigate} />
      </div>
      <div className="space-y-3 border-t pt-3">
        <UserCard user={user} />
        <p className="text-[11px] text-muted-foreground">
          TaskFlow · 版本 {APP_VERSION}
        </p>
      </div>
    </div>
  );
}
