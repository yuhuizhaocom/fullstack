export const FILE_MAX_SIZE = 100 * 1024 * 1024;
export const FILE_TTL_HOURS = 24;
export const FILE_LIST_LIMIT = 30;
export const FILE_NAME_MAX = 200;
export const FILE_RATE_LIMIT_GUEST = 10;
export const FILE_RATE_LIMIT_USER = 30;

export type SharedFilePayload = {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  createdAt: string;
  expiresAt: string;
  downloadUrl: string;
};

/** 去掉控制字符、路径分隔符等危险字符，保留中文与常见符号 */
export function sanitizeFileName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FILE_NAME_MAX);
}

export function fileExpiry(): Date {
  return new Date(Date.now() + FILE_TTL_HOURS * 60 * 60 * 1000);
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

/** 剩余有效期文案：过期返回 null */
export function remainingLabel(
  expiresAt: string | Date,
  now: number = Date.now()
): string | null {
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const diff = target.getTime() - now;
  if (Number.isNaN(diff) || diff <= 0) return null;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟后过期`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0
    ? `${hours} 小时 ${restMinutes} 分后过期`
    : `${hours} 小时后过期`;
}
