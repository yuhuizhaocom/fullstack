import { CalendarDays, User2 } from "lucide-react";

import { TaskPriorityBadge, TaskStatusBadge } from "@/components/task-badges";
import { TaskActions } from "@/components/tasks/task-actions";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, isTaskOverdue } from "@/lib/format";
import type { TaskItem } from "@/lib/task-meta";
import { cn } from "@/lib/utils";

export function TaskTable({ tasks }: { tasks: TaskItem[] }) {
  return (
    <Card className="hidden overflow-hidden md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="min-w-[220px]">任务</TableHead>
            <TableHead className="w-[110px]">负责人</TableHead>
            <TableHead className="w-[100px]">状态</TableHead>
            <TableHead className="w-[88px]">优先级</TableHead>
            <TableHead className="w-[130px]">截止日期</TableHead>
            <TableHead className="w-[136px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const overdue = isTaskOverdue(task.dueDate, task.status);
            return (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    {task.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User2 className="size-3.5" />
                    {task.assignee || "未指派"}
                  </span>
                </TableCell>
                <TableCell>
                  <TaskStatusBadge status={task.status} />
                </TableCell>
                <TableCell>
                  <TaskPriorityBadge priority={task.priority} />
                </TableCell>
                <TableCell>
                  {task.dueDate ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        overdue
                          ? "font-medium text-rose-600"
                          : "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="size-3.5" />
                      {formatDate(task.dueDate)}
                      {overdue && <span className="ml-0.5">已逾期</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <TaskActions task={task} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
