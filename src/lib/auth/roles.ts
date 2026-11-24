import type { UserRole } from "@prisma/client";

export const USER_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "USER"];

export const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  USER: "普通用户",
};

export const roleBadgeClass: Record<UserRole, string> = {
  SUPER_ADMIN: "border-rose-200 bg-rose-50 text-rose-700",
  ADMIN: "border-indigo-200 bg-indigo-50 text-indigo-700",
  USER: "border-slate-200 bg-slate-50 text-slate-600",
};

/** 管理员及以上可以查看和管理所有任务 */
export function isManager(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}
