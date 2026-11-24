import {
  LayoutDashboard,
  ListTodo,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 未设置表示所有角色可见 */
  roles?: UserRole[];
};

export const navItems: NavItem[] = [
  {
    href: "/",
    label: "仪表盘",
    description: "任务概览与最新动态",
    icon: LayoutDashboard,
  },
  {
    href: "/tasks",
    label: "任务管理",
    description: "创建、编辑与流转任务",
    icon: ListTodo,
  },
  {
    href: "/users",
    label: "用户管理",
    description: "账号角色与权限分配",
    icon: Users,
    roles: ["SUPER_ADMIN"],
  },
];

export function navItemsFor(role: UserRole): NavItem[] {
  return navItems.filter((item) => !item.roles || item.roles.includes(role));
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
