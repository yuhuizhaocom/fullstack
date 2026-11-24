const globalForRate = globalThis as unknown as {
  __clipRate?: Map<string, number[]>;
};

const buckets = globalForRate.__clipRate ?? new Map<string, number[]>();
globalForRate.__clipRate = buckets;

/** 简单的进程内滑动窗口限流：返回 false 表示超限 */
export function allowRequest(
  key: string,
  limit: number,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((time) => now - time < windowMs);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }

  recent.push(now);
  buckets.set(key, recent);

  // 防止 Map 无限增长
  if (buckets.size > 5000) {
    for (const [bucketKey, times] of buckets) {
      if (times.every((time) => now - time >= windowMs)) {
        buckets.delete(bucketKey);
      }
    }
  }

  return true;
}
