import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Inbox,
  ListTodo,
} from "lucide-react";

import { DatabaseNotice } from "@/components/database-notice";
import { TaskStatusBadge } from "@/components/task-badges";
import { CreateTaskButton } from "@/components/tasks/create-task-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatToday } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { taskStatusMeta, type TaskItem } from "@/lib/task-meta";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "仪表盘",
};

const techStack = [
  "Next.js 15",
  "TypeScript",
  "Tailwind CSS",
  "shadcn/ui",
  "Prisma",
  "PostgreSQL",
];

export default async function DashboardPage() {
  let total = 0;
  let todo = 0;
  let inProgress = 0;
  let done = 0;
  let recent: TaskItem[] = [];
  let dbConnected = true;

  try {
    const [totalCount, todoCount, inProgressCount, doneCount, recentTasks] =
      await Promise.all([
        prisma.task.count(),
        prisma.task.count({ where: { status: "TODO" } }),
        prisma.task.count({ where: { status: "IN_PROGRESS" } }),
        prisma.task.count({ where: { status: "DONE" } }),
        prisma.task.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      ]);

    total = totalCount;
    todo = todoCount;
    inProgress = inProgressCount;
    done = doneCount;
    recent = recentTasks;
  } catch (error) {
    dbConnected = false;
    console.error("[dashboard] 数据库查询失败:", error);
  }

  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  const statCards = [
    {
      label: "全部任务",
      value: total,
      icon: ListTodo,
      iconClass: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "待办",
      value: todo,
      icon: Circle,
      iconClass: "bg-amber-50 text-amber-600",
    },
    {
      label: "进行中",
      value: inProgress,
      icon: Clock,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "已完成",
      value: done,
      icon: CheckCircle2,
      iconClass: "bg-emerald-50 text-emerald-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            任务概览、完成进度与最新动态
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit gap-1.5 bg-background text-muted-foreground"
        >
          <CalendarDays className="size-3.5" />
          {formatToday()}
        </Badge>
      </div>

      {!dbConnected && <DatabaseNotice />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-border/60 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </p>
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg",
                      item.iconClass
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {item.value}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">完成进度</CardTitle>
            <CardDescription>已完成任务占全部任务的比例</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-semibold tabular-nums">
                {completionRate}%
              </span>
              <span className="text-xs text-muted-foreground">
                {done} / {total} 已完成
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-center">
              {[
                { label: "待办", value: todo },
                { label: "进行中", value: inProgress },
                { label: "已完成", value: done },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-lg font-semibold tabular-nums">
                    {item.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="space-y-1">
              <CardTitle className="text-base">最近任务</CardTitle>
              <CardDescription>按创建时间排序的最新 5 条任务</CardDescription>
            </div>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              查看全部
              <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">还没有任务</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    创建第一条任务，开始体验完整的 CRUD 流程。
                  </p>
                </div>
                <CreateTaskButton label="创建任务" size="sm" />
              </div>
            ) : (
              recent.map((task) => (
                <Link
                  key={task.id}
                  href="/tasks"
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      taskStatusMeta[task.status].dotClass
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {task.assignee || "未指派"} ·{" "}
                      {formatDateTime(task.createdAt)}
                    </p>
                  </div>
                  <TaskStatusBadge
                    status={task.status}
                    className="shrink-0"
                  />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">系统状态</CardTitle>
            <CardDescription>应用运行与数据库连通性</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">版本</span>
              <span className="font-mono text-xs tabular-nums">
                {APP_VERSION}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Web 服务</span>
              <Badge variant="success" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                运行中
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">PostgreSQL</span>
              <Badge
                variant={dbConnected ? "success" : "warning"}
                className="gap-1.5"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    dbConnected ? "bg-emerald-500" : "bg-amber-500"
                  )}
                />
                {dbConnected ? "已连接" : "未连接"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">健康检查</span>
              <Link
                href="/api/health"
                className="text-xs font-medium text-primary hover:underline"
              >
                /api/health
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">技术栈</CardTitle>
            <CardDescription>本项目使用的核心框架与工具</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {techStack.map((tech) => (
              <Badge
                key={tech}
                variant="outline"
                className="bg-muted/40 font-normal"
              >
                {tech}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
