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
  title: "注册",
};

export default function RegisterPage() {
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
          <CardTitle className="text-xl">注册</CardTitle>
          <CardDescription>
            注册后默认是普通用户，只能看到自己创建的任务
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthForm mode="register" />
        <p className="text-center text-xs text-muted-foreground">
          已有账号？
          <Link href="/login" className="font-medium text-primary hover:underline">
            去登录
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
