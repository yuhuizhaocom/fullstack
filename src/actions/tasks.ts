"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageTask } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
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

/**
 * 写操作统一校验：登录 + 数据权限（创建者或管理员以上）。
 * 返回任务记录用于后续更新，返回字符串表示错误信息。
 */
async function authorizeTaskAction(
  id: string
): Promise<{ ok: true; ownerId: string | null } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "登录状态已失效，请重新登录" };
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!task) {
    return { ok: false, error: "目标任务不存在或已被删除" };
  }
  if (!canManageTask(user, task)) {
    return { ok: false, error: "你没有权限操作该任务" };
  }

  return { ok: true, ownerId: task.ownerId };
}

export async function createTask(values: TaskFormValues): Promise<TaskActionResult> {
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "表单内容不合法" };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "登录状态已失效，请重新登录" };
    }

    await prisma.task.create({
      data: { ...toTaskData(parsed.data), ownerId: user.id },
    });
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
    const auth = await authorizeTaskAction(parsedId.data);
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

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
    const auth = await authorizeTaskAction(parsedId.data);
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

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
    const auth = await authorizeTaskAction(parsedId.data);
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

    await prisma.task.delete({ where: { id: parsedId.data } });
    revalidateTaskPages();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
