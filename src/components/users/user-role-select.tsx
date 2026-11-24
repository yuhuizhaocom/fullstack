"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateUserRole } from "@/actions/users";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { USER_ROLES, roleLabels } from "@/lib/auth/roles";
import type { UserRole } from "@prisma/client";

export function UserRoleSelect({
  userId,
  role,
  disabled = false,
}: {
  userId: string;
  role: UserRole;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<UserRole>(role);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    const nextRole = next as UserRole;
    setValue(nextRole);

    startTransition(async () => {
      try {
        const result = await updateUserRole(userId, nextRole);
        if (!result.ok) {
          toast.error(result.error);
          setValue(role);
          return;
        }
        toast.success(`角色已调整为「${roleLabels[nextRole]}」`);
        router.refresh();
      } catch {
        toast.error("修改失败，请稍后重试");
        setValue(role);
      }
    });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || isPending}>
      <SelectTrigger className="h-8 w-[132px] text-xs" aria-label="调整用户角色">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {USER_ROLES.map((item) => (
          <SelectItem key={item} value={item} className="text-xs">
            {roleLabels[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
