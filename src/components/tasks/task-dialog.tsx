"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createTask, updateTask } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toDateInputValue } from "@/lib/format";
import {
  taskPriorityOptions,
  taskStatusOptions,
  type TaskItem,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-meta";

type TaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskItem | null;
};

type FormState = {
  title: string;
  description: string;
  assignee: string;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  dueDate: string;
};

const emptyForm: FormState = {
  title: "",
  description: "",
  assignee: "",
  status: "TODO",
  priority: "MEDIUM",
  dueDate: "",
};

export function TaskDialog({ open, onOpenChange, task }: TaskDialogProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(task);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      task
        ? {
            title: task.title,
            description: task.description ?? "",
            assignee: task.assignee ?? "",
            status: task.status,
            priority: task.priority,
            dueDate: toDateInputValue(task.dueDate),
          }
        : emptyForm
    );
  }, [open, task]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = form.title.trim();
    if (!title) {
      setError("请输入任务标题");
      return;
    }

    setError(null);
    const payload = {
      ...form,
      title,
      description: form.description.trim(),
      assignee: form.assignee.trim(),
    };

    startTransition(async () => {
      try {
        const result = task
          ? await updateTask(task.id, payload)
          : await createTask(payload);

        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }

        toast.success(isEdit ? "任务已更新" : "任务已创建");
        onOpenChange(false);
        router.refresh();
      } catch {
        const message = "请求失败，请检查服务与数据库连接";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑任务" : "新建任务"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "更新任务信息，保存后列表会立即刷新。"
              : "填写任务信息，创建后会立即出现在列表中。"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div className="space-y-2">
            <Label htmlFor="task-title">
              任务标题 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="例如：完成 WSL 安装脚本联调"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">任务描述</Label>
            <Textarea
              id="task-description"
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="补充背景、验收标准或备注（可选）"
              maxLength={1000}
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-assignee">负责人</Label>
              <Input
                id="task-assignee"
                value={form.assignee}
                onChange={(event) => update("assignee", event.target.value)}
                placeholder="例如：张伟"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">截止日期</Label>
              <Input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(event) => update("dueDate", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={form.status}
                onValueChange={(value) => update("status", value as TaskStatusValue)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  {taskStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>优先级</Label>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  update("priority", value as TaskPriorityValue)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择优先级" />
                </SelectTrigger>
                <SelectContent>
                  {taskPriorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "保存修改" : "创建任务"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
