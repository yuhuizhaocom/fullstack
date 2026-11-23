import { Badge } from "@/components/ui/badge";
import {
  taskPriorityMeta,
  taskStatusMeta,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-meta";
import { cn } from "@/lib/utils";

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatusValue;
  className?: string;
}) {
  const meta = taskStatusMeta[status];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", meta.badgeClass, className)}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClass)} />
      {meta.label}
    </Badge>
  );
}

export function TaskPriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriorityValue;
  className?: string;
}) {
  const meta = taskPriorityMeta[priority];
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", meta.badgeClass, className)}
    >
      {meta.label}
    </Badge>
  );
}
