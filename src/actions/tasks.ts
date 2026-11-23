"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { TASK_STATUSES, type TaskStatusValue } from "@/lib/task-meta";
import { taskInputSchema, type TaskFormValues } from "@/lib/validations/task";

export type TaskActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().trim().min(1, "任务 ID 不能为空");

const statusSchema = z.enum(TASK_STATUSES);

function revalidateTaskPages() {
  revalidatePath("/");
  revalidatePath("/tasks");
}

function toTaskData(values: TaskFormValues) {
  return {
    title: values.title,
    description: values.description ? values.description : null,
    assignee: values.assignee ? values.assignee : null,
    status: values.status,
    priority: values.priority,
    dueDate: values.dueDate ? new Date(`${values.dueDate}T00:00:00.000Z`) : null,
  };
}

function toErrorMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return "目标任务不存在或已被删除";
    }
    return `数据库操作失败（${error.code}）`;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "无法连接数据库，请确认 PostgreSQL 已启动且 DATABASE_URL 配置正确";
  }
  console.error("[task-action]", error);
  return "操作失败，请稍后重试";
}

export async function createTask(values: TaskFormValues): Promise<TaskActionResult> {
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "表单内容不合法" };
  }

  try {
    await prisma.task.create({ data: toTaskData(parsed.data) });
    revalidateTaskPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function updateTask(
  id: string,
  values: TaskFormValues
): Promise<TaskActionResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "任务 ID 不合法" };
  }

  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "表单内容不合法" };
  }

  try {
    await prisma.task.update({
      where: { id: parsedId.data },
      data: toTaskData(parsed.data),
    });
    revalidateTaskPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatusValue
): Promise<TaskActionResult> {
  const parsedId = idSchema.safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) {
    return { ok: false, error: "任务参数不合法" };
  }

  try {
    await prisma.task.update({
      where: { id: parsedId.data },
      data: { status: parsedStatus.data },
    });
    revalidateTaskPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function deleteTask(id: string): Promise<TaskActionResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "任务 ID 不合法" };
  }

  try {
    await prisma.task.delete({ where: { id: parsedId.data } });
    revalidateTaskPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
