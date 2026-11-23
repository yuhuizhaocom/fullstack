import { CalendarDays, User2 } from "lucide-react";

import { TaskPriorityBadge, TaskStatusBadge } from "@/components/task-badges";
import { TaskActions } from "@/components/tasks/task-actions";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, isTaskOverdue } from "@/lib/format";
import type { TaskItem } from "@/lib/task-meta";
import { cn } from "@/lib/utils";

export function TaskCardList({ tasks }: { tasks: TaskItem[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {tasks.map((task) => {
        const overdue = isTaskOverdue(task.dueDate, task.status);
        return (
          <Card key={task.id} className="shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{task.title}</p>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {task.description}
                    </p>
                  )}
                </div>
                <TaskActions task={task} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} />
                <TaskPriorityBadge priority={task.priority} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <User2 className="size-3.5" />
                  {task.assignee || "未指派"}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    overdue && "font-medium text-rose-600"
                  )}
                >
                  <CalendarDays className="size-3.5" />
                  {task.dueDate ? formatDate(task.dueDate) : "未设置截止日期"}
                  {overdue && "（已逾期）"}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
