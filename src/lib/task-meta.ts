export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export type TaskStatusValue = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  dueDate: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const taskStatusOptions: { value: TaskStatusValue; label: string }[] = [
  { value: "TODO", label: "待办" },
  { value: "IN_PROGRESS", label: "进行中" },
  { value: "DONE", label: "已完成" },
];

export const taskPriorityOptions: { value: TaskPriorityValue; label: string }[] = [
  { value: "LOW", label: "低" },
  { value: "MEDIUM", label: "中" },
  { value: "HIGH", label: "高" },
];

export const taskStatusMeta: Record<
  TaskStatusValue,
  { label: string; badgeClass: string; dotClass: string }
> = {
  TODO: {
    label: "待办",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  IN_PROGRESS: {
    label: "进行中",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
  },
  DONE: {
    label: "已完成",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
};

export const taskPriorityMeta: Record<
  TaskPriorityValue,
  { label: string; badgeClass: string }
> = {
  LOW: { label: "低", badgeClass: "border-slate-200 bg-slate-50 text-slate-600" },
  MEDIUM: { label: "中", badgeClass: "border-violet-200 bg-violet-50 text-violet-700" },
  HIGH: { label: "高", badgeClass: "border-rose-200 bg-rose-50 text-rose-700" },
};
