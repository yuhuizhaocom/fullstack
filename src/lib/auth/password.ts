import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16384;

/** 生成 `scrypt$cost$salt$hash` 格式的密码摘要 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: COST, r: 8, p: 1 });
  return `scrypt$${COST}$${salt}$${hash.toString("hex")}`;
}

/** 校验密码，格式不合法或长度不符时返回 false */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, cost, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, KEY_LENGTH, {
    N: Number(cost),
    r: 8,
    p: 1,
  });
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}
