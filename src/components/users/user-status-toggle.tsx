"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setUserDisabled } from "@/actions/users";
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

export function UserStatusToggle({
  userId,
  disabled,
  name,
}: {
  userId: string;
  disabled: boolean;
  name: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function apply(next: boolean) {
    startTransition(async () => {
      try {
        const result = await setUserDisabled(userId, next);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(next ? "账号已禁用" : "账号已启用");
        setConfirmOpen(false);
        router.refresh();
      } catch {
        toast.error("操作失败，请稍后重试");
      }
    });
  }

  if (disabled) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        disabled={isPending}
        onClick={() => apply(false)}
      >
        {isPending && <Loader2 className="size-3.5 animate-spin" />}
        启用
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-muted-foreground hover:text-destructive"
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
      >
        禁用
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>禁用账号</AlertDialogTitle>
            <AlertDialogDescription>
              禁用后「{name}」将立即下线，且无法再登录。任务数据会保留，可随时重新启用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                apply(true);
              }}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              确认禁用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
