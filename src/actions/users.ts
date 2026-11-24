"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type UserActionResult = { ok: true } | { ok: false; error: string };

const roleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "USER"]);
const idSchema = z.string().trim().min(1);

export async function updateUserRole(
  userId: string,
  role: string
): Promise<UserActionResult> {
  const actor = await requireRole(["SUPER_ADMIN"]);

  const parsedId = idSchema.safeParse(userId);
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedId.success || !parsedRole.success) {
    return { ok: false, error: "参数不合法" };
  }
  if (parsedId.data === actor.id) {
    return { ok: false, error: "不能修改自己的角色" };
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: parsedId.data } });
    if (!target) {
      return { ok: false, error: "用户不存在" };
    }

    if (target.role === "SUPER_ADMIN" && parsedRole.data !== "SUPER_ADMIN") {
      const superAdminCount = await prisma.user.count({
        where: { role: "SUPER_ADMIN" },
      });
      if (superAdminCount <= 1) {
        return { ok: false, error: "系统至少需要保留一个超级管理员" };
      }
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { role: parsedRole.data },
    });

    revalidatePath("/users");
    return { ok: true };
  } catch (error) {
    console.error("[users] 修改角色失败:", error);
    return { ok: false, error: "修改失败，请稍后重试" };
  }
}

export async function setUserDisabled(
  userId: string,
  disabled: boolean
): Promise<UserActionResult> {
  const actor = await requireRole(["SUPER_ADMIN"]);

  const parsedId = idSchema.safeParse(userId);
  if (!parsedId.success || typeof disabled !== "boolean") {
    return { ok: false, error: "参数不合法" };
  }
  if (parsedId.data === actor.id) {
    return { ok: false, error: "不能禁用自己的账号" };
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: parsedId.data } });
    if (!target) {
      return { ok: false, error: "用户不存在" };
    }
    if (target.role === "SUPER_ADMIN" && disabled) {
      return { ok: false, error: "超级管理员账号不能禁用，请先调整角色" };
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { disabled },
    });

    // 禁用后立刻下线该用户的所有会话
    if (disabled) {
      await prisma.session.deleteMany({ where: { userId: target.id } });
    }

    revalidatePath("/users");
    return { ok: true };
  } catch (error) {
    console.error("[users] 修改账号状态失败:", error);
    return { ok: false, error: "修改失败，请稍后重试" };
  }
}
