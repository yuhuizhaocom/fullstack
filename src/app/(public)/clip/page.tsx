import type { Metadata } from "next";

import { ClipJoinForm } from "@/components/clip/clip-join-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "临时剪贴板",
};

export default function ClipHomePage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">临时剪贴板</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          无需登录，输入相同的频道码即可在设备之间互传文本
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">加入频道</CardTitle>
          <CardDescription>
            6 位字母或数字；把频道码或链接发给对方即可一起使用
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClipJoinForm />
        </CardContent>
      </Card>

      <div className="space-y-1 rounded-lg border bg-background/70 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <p>· 知道频道码的人都能看到内容，请勿传输密码、密钥等敏感信息</p>
        <p>· 内容实时同步，24 小时后自动清理</p>
        <p>· 收到新内容时会尝试自动写入剪贴板，失败可手动点击复制</p>
      </div>
    </div>
  );
}
