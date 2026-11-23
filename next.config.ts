import type { NextConfig } from "next";

/**
 * 构建版本号：年月日时分秒（Asia/Shanghai），例如 20261123230612。
 * 在 `next build` 时计算并注入，因此生产环境显示的就是该次构建/发版时间。
 */
function buildVersion() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return [
    pick("year"),
    pick("month"),
    pick("day"),
    pick("hour"),
    pick("minute"),
    pick("second"),
  ].join("");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || buildVersion(),
  },
  experimental: {
    // 构建 worker 数量。默认 4；在 cgroup pids 限额较低的容器里（如 512）会因
    // fork 失败报 spawn EAGAIN，可通过 NEXT_BUILD_CPUS=1 或 2 调低。
    cpus: Number(process.env.NEXT_BUILD_CPUS) || 4,
  },
};

export default nextConfig;
