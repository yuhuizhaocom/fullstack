import { Database } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function DatabaseNotice() {
  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Database className="size-4" />
        </span>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-amber-900">数据库尚未就绪</p>
          <p className="text-sm leading-relaxed text-amber-800/80">
            当前无法连接 PostgreSQL。请在项目根目录执行一键安装脚本完成数据库初始化，或检查
            <code className="mx-1 rounded bg-background px-1.5 py-0.5 text-xs">
              .env
            </code>
            中的 DATABASE_URL。
          </p>
          <code className="block w-fit rounded-md border bg-background px-2 py-1 text-xs">
            bash scripts/install.sh
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
