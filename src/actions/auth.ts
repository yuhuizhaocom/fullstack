"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type AuthFormState = { error: string } | null;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("邮箱格式不正确")
  .max(120, "邮箱不能超过 120 个字符");

const registerSchema = z.object({
  name: z.string().trim().min(1, "请输入昵称").max(50, "昵称不能超过 50 个字符"),
  email: emailSchema,
  password: z.string().min(8, "密码至少 8 位").max(72, "密码不能超过 72 位"),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "请输入密码").max(72, "密码不能超过 72 位"),
});

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "表单内容不合法";
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const { name, email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { error: "该邮箱已被注册" };
    }

    // 首个注册用户自动成为超级管理员，避免系统出现无人可管理的情况
    const userCount = await prisma.user.count();
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        role: userCount === 0 ? "SUPER_ADMIN" : "USER",
      },
    });

    await createSession(user.id);
  } catch (error) {
    console.error("[auth] 注册失败:", error);
    return { error: "注册失败，请稍后重试" };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { error: "邮箱或密码不正确" };
    }

    await createSession(user.id);
  } catch (error) {
    console.error("[auth] 登录失败:", error);
    return { error: "登录失败，请稍后重试" };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/login");
}
