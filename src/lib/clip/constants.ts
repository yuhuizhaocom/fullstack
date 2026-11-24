export const CLIP_CHANNEL_LENGTH = 6;
export const CLIP_CHANNEL_PATTERN = /^[a-z0-9]{6}$/;
export const CLIP_MAX_LENGTH = 64 * 1024;
export const CLIP_HISTORY_LIMIT = 50;
export const CLIP_TTL_HOURS = 24;
export const CLIP_RATE_LIMIT = 30;
/** 剪贴板图片复用附件存储，消息里只保存下载地址 */
export const CLIP_IMAGE_URL_PATTERN = /^\/api\/files\/[A-Za-z0-9]+$/;
export const CLIP_KIND_TEXT = "TEXT";
export const CLIP_KIND_IMAGE = "IMAGE";

export type ClipKind = "TEXT" | "IMAGE";

export function normalizeChannel(code: string): string {
  return code.trim().toLowerCase();
}

export function isValidChannel(code: string): boolean {
  return CLIP_CHANNEL_PATTERN.test(code);
}

export function randomChannel(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < CLIP_CHANNEL_LENGTH; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export function clipCutoff(): Date {
  return new Date(Date.now() - CLIP_TTL_HOURS * 60 * 60 * 1000);
}

export type ClipPayload = {
  id: string;
  channel: string;
  content: string;
  clientId: string;
  kind: ClipKind;
  createdAt: string;
};
