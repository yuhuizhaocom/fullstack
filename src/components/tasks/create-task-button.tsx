"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { TaskDialog } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";

type CreateTaskButtonProps = {
  label?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
};

export function CreateTaskButton({
  label = "新建任务",
  className,
  variant = "default",
  size = "default",
}: CreateTaskButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        {label}
      </Button>
      <TaskDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
