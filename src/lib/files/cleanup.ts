import { prisma } from "@/lib/prisma";
import { removeStored } from "@/lib/files/storage";

const globalForFiles = globalThis as unknown as {
  __fileCleanupStarted?: boolean;
};

/** 删除已过期记录及其磁盘文件，返回清理数量 */
export async function purgeExpiredFiles(): Promise<number> {
  const expired = await prisma.sharedFile.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, storageKey: true },
    take: 200,
  });
  if (expired.length === 0) return 0;

  for (const file of expired) {
    await removeStored(file.storageKey);
  }
  await prisma.sharedFile.deleteMany({
    where: { id: { in: expired.map((file) => file.id) } },
  });

  return expired.length;
}

/**
 * 进程内定时清理（每 10 分钟），保证无人访问时也能到期清空磁盘。
 * 由 instrumentation.ts 在服务启动时调用一次。
 */
export function startFileCleanup(): void {
  if (globalForFiles.__fileCleanupStarted) return;
  globalForFiles.__fileCleanupStarted = true;

  const run = () => {
    purgeExpiredFiles()
      .then((count) => {
        if (count > 0) console.log(`[files] 已清理过期附件 ${count} 个`);
      })
      .catch((error) => console.error("[files] 清理过期附件失败:", error));
  };

  run();
  setInterval(run, 10 * 60 * 1000).unref?.();
}
