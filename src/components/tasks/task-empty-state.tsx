import Link from "next/link";
import { Inbox } from "lucide-react";

import { CreateTaskButton } from "@/components/tasks/create-task-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function TaskEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-4 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="size-6" />
        </span>
        <div>
          <p className="text-sm font-medium">
            {filtered ? "没有匹配的任务" : "还没有任务"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {filtered
              ? "换个关键词或清除筛选条件后再试。"
              : "创建第一条任务，体验完整的新增、编辑与删除流程。"}
          </p>
        </div>
        {filtered ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/tasks">清除筛选</Link>
          </Button>
        ) : (
          <CreateTaskButton label="创建任务" size="sm" />
        )}
      </CardContent>
    </Card>
  );
}
