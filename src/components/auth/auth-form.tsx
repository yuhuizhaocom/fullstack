"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import {
  loginAction,
  registerAction,
  type AuthFormState,
} from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    null
  );

  return (
    <form action={formAction} className="space-y-3.5">
      {mode === "register" && (
        <div className="space-y-1.5">
          <Label htmlFor="name">昵称</Label>
          <Input
            id="name"
            name="name"
            placeholder="你的名字"
            autoComplete="name"
            maxLength={50}
            required
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          maxLength={120}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder={mode === "register" ? "至少 8 位" : "请输入密码"}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 8 : undefined}
          maxLength={72}
          required
        />
      </div>

      {state?.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {mode === "login" ? "登录" : "注册并登录"}
      </Button>
    </form>
  );
}
