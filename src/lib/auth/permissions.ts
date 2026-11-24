import type { Prisma } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { isManager } from "@/lib/auth/roles";

/** 数据权限：普通用户只能看到自己创建的任务 */
export function taskScope(user: SessionUser): Prisma.TaskWhereInput {
  return isManager(user.role) ? {} : { ownerId: user.id };
}

/** 能否修改/删除某个任务：任务创建者或管理员以上 */
export function canManageTask(
  user: SessionUser,
  task: { ownerId: string | null }
): boolean {
  return isManager(user.role) || task.ownerId === user.id;
}
