import type { Metadata } from "next";

import { DatabaseNotice } from "@/components/database-notice";
import { UserRoleSelect } from "@/components/users/user-role-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleBadgeClass, roleLabels } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "用户管理",
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  createdAt: Date;
  _count: { tasks: number };
};

export default async function UsersPage() {
  const current = await requireRole(["SUPER_ADMIN"]);

  let users: UserRow[] = [];
  let dbError = false;

  try {
    users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { tasks: true } },
      },
    });
  } catch (error) {
    dbError = true;
    console.error("[users] 查询用户失败:", error);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          仅超级管理员可见；调整角色后立即生效，无需对方重新登录
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">账号列表</CardTitle>
          <CardDescription>
            超级管理员可管理全部用户与角色，管理员可管理全部任务，普通用户仅能访问自己创建的任务
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dbError ? (
            <DatabaseNotice />
          ) : (
            <div className="divide-y">
              {users.map((user) => {
                const isSelf = user.id === current.id;
                return (
                  <div
                    key={user.id}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {user.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {user.name}
                          {isSelf && (
                            <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", roleBadgeClass[user.role])}>
                              我
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email} · {user._count.tasks} 个任务 · 注册于{" "}
                          {formatDateTime(user.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:shrink-0">
                      <span
                        className={cn(
                          "hidden rounded-full border px-2 py-0.5 text-[11px] sm:inline-flex",
                          roleBadgeClass[user.role]
                        )}
                      >
                        {roleLabels[user.role]}
                      </span>
                      <UserRoleSelect
                        userId={user.id}
                        role={user.role}
                        disabled={isSelf}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
