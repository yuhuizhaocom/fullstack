import path from "node:path";
import { mkdir, rename, unlink } from "node:fs/promises";

/** 附件落盘目录；生产环境可通过 FILES_DIR 指到独立磁盘 */
export function storageDir(): string {
  return process.env.FILES_DIR || path.join(process.cwd(), "var", "files");
}

/** 只接受随机 key，basename 兜底防止路径穿越 */
export function storagePath(key: string): string {
  return path.join(storageDir(), path.basename(key));
}

export async function ensureStorageDir(): Promise<void> {
  await mkdir(storageDir(), { recursive: true });
}

export async function removeStored(key: string): Promise<void> {
  await unlink(storagePath(key)).catch(() => undefined);
}

/** 上传完成后把 .part 临时文件转正 */
export async function finalizeUpload(tempKey: string, key: string): Promise<void> {
  await rename(storagePath(tempKey), storagePath(key));
}
