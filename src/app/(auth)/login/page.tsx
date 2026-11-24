import type { Metadata } from "next";
import Link from "next/link";
import { ListTodo } from "lucide-react";

import { AuthForm } from "@/components/auth/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "登录",
};

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <ListTodo className="size-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold leading-none">TaskFlow</span>
            <span className="mt-1 text-[11px] leading-none text-muted-foreground">
              全栈任务管理台
            </span>
          </span>
        </div>
        <div className="space-y-1">
          <CardTitle className="text-xl">登录</CardTitle>
          <CardDescription>使用邮箱和密码登录你的账号</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthForm mode="login" />
        <p className="text-center text-xs text-muted-foreground">
          还没有账号？
          <Link href="/register" className="font-medium text-primary hover:underline">
            立即注册
          </Link>
        </p>
        <div className="space-y-1 border-t pt-3 text-center">
          <Link
            href="/chat"
            className="block text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            无需登录，进入公共聊天室 →
          </Link>
          <Link
            href="/files"
            className="block text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            无需登录，分享附件（≤100MB / 24 小时） →
          </Link>
          <Link
            href="/game"
            className="block text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            无需登录，玩像素冒险 RPG →
          </Link>
          <Link
            href="/clip"
            className="block text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            无需登录，使用临时剪贴板 →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
