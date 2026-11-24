export const CHAT_MAX_LENGTH = 2000;
export const CHAT_HISTORY_LIMIT = 100;
export const CHAT_TTL_DAYS = 7;
export const CHAT_RATE_LIMIT_GUEST = 20;
export const CHAT_RATE_LIMIT_USER = 60;
export const CHAT_NICKNAME_MAX = 20;
export const CHAT_GUEST_PREFIX = "游客·";

/** 去掉控制字符并压缩空白，防止昵称注入换行或不可见字符 */
export function normalizeNickname(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_NICKNAME_MAX);
}

/** 游客统一加前缀，避免与真实账号名称混淆 */
export function guestSender(raw: string): string {
  const name = normalizeNickname(raw);
  return name ? `${CHAT_GUEST_PREFIX}${name}` : `${CHAT_GUEST_PREFIX}匿名`;
}

export function chatCutoff(): Date {
  return new Date(Date.now() - CHAT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type ChatPayload = {
  id: string;
  sender: string;
  content: string;
  isGuest: boolean;
  userId: string | null;
  clientId: string | null;
  createdAt: string;
};
