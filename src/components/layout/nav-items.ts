import { LayoutDashboard, ListTodo, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
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
];

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
