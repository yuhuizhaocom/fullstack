import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { DatabaseNotice } from "@/components/database-notice";
import { CreateTaskButton } from "@/components/tasks/create-task-button";
import { TaskCardList } from "@/components/tasks/task-card-list";
import { TaskEmptyState } from "@/components/tasks/task-empty-state";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskTable } from "@/components/tasks/task-table";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskItem,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-meta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "任务管理",
};

const PAGE_SIZE = 8;

type TaskSearchParams = {
  q?: string;
  status?: string;
  priority?: string;
  page?: string;
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TaskSearchParams>;
}) {
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = TASK_STATUSES.includes(params.status as TaskStatusValue)
    ? (params.status as TaskStatusValue)
    : "";
  const priority = TASK_PRIORITIES.includes(
    params.priority as TaskPriorityValue
  )
    ? (params.priority as TaskPriorityValue)
    : "";

  const pageParam = Number.parseInt(params.page ?? "1", 10);
  const requestedPage =
    Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  let tasks: TaskItem[] = [];
  let total = 0;
  let totalPages = 1;
  let page = requestedPage;
  let dbError = false;

  try {
    const where: Prisma.TaskWhereInput = {};

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { assignee: { contains: q, mode: "insensitive" } },
      ];
    }
    if (status) where.status = status;
    if (priority) where.priority = priority;

    total = await prisma.task.count({ where });
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(requestedPage, totalPages);

    tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  } catch (error) {
    dbError = true;
    console.error("[tasks] 查询任务失败:", error);
  }

  const hasFilters = Boolean(q || status || priority);

  function buildPageHref(target: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (status) search.set("status", status);
    if (priority) search.set("priority", priority);
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `/tasks?${query}` : "/tasks";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">任务管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            支持搜索、筛选、分页与完整的增删改查
          </p>
        </div>
        <CreateTaskButton className="w-full sm:w-auto" />
      </div>

      <TaskFilters q={q} status={status} priority={priority} />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          共 <span className="font-medium text-foreground">{total}</span> 条任务
          {hasFilters ? "（已筛选）" : ""}
        </p>
        <p className="hidden text-xs text-muted-foreground sm:block">
          第 {page} / {totalPages} 页
        </p>
      </div>

      {dbError ? (
        <DatabaseNotice />
      ) : total === 0 ? (
        <TaskEmptyState filtered={hasFilters} />
      ) : (
        <>
          <TaskTable tasks={tasks} />
          <TaskCardList tasks={tasks} />

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildPageHref(page - 1)}>
                    <ChevronLeft className="size-4" />
                    上一页
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft className="size-4" />
                  上一页
                </Button>
              )}
              <span className="min-w-16 text-center text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildPageHref(page + 1)}>
                    下一页
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  下一页
                  <ChevronRight className="size-4" />
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
