"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTask, updateTaskStatus } from "@/actions/tasks";
import { TaskDialog } from "@/components/tasks/task-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import type { TaskItem } from "@/lib/task-meta";

export function TaskActions({ task }: { task: TaskItem }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDone = task.status === "DONE";
  const toggleLabel = isDone ? "重新打开任务" : "标记为已完成";

  function handleToggle() {
    startTransition(async () => {
      try {
        const result = await updateTaskStatus(task.id, isDone ? "TODO" : "DONE");
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(isDone ? "任务已重新打开" : "任务已完成");
        router.refresh();
      } catch {
        toast.error("操作失败，请稍后重试");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteTask(task.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("任务已删除");
        setDeleteOpen(false);
        router.refresh();
      } catch {
        toast.error("删除失败，请稍后重试");
      }
    });
  }

  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-emerald-600"
        onClick={handleToggle}
        disabled={isPending}
        title={toggleLabel}
        aria-label={toggleLabel}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isDone ? (
          <RotateCcw className="size-4" />
        ) : (
          <Check className="size-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-primary"
        onClick={() => setEditOpen(true)}
        disabled={isPending}
        title="编辑任务"
        aria-label="编辑任务"
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
        disabled={isPending}
        title="删除任务"
        aria-label="删除任务"
      >
        <Trash2 className="size-4" />
      </Button>

      <TaskDialog open={editOpen} onOpenChange={setEditOpen} task={task} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除任务</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{task.title}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
