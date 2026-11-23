import { z } from "zod";

import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/task-meta";

export const taskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "请输入任务标题")
    .max(120, "标题不能超过 120 个字符"),
  description: z.string().trim().max(1000, "描述不能超过 1000 个字符"),
  assignee: z.string().trim().max(50, "负责人不能超过 50 个字符"),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "截止日期格式不正确")
    .or(z.literal("")),
});

export type TaskFormValues = z.infer<typeof taskInputSchema>;
