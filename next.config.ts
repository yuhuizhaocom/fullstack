import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // 构建 worker 数量。默认 4；在 cgroup pids 限额较低的容器里（如 512）会因
    // fork 失败报 spawn EAGAIN，可通过 NEXT_BUILD_CPUS=1 或 2 调低。
    cpus: Number(process.env.NEXT_BUILD_CPUS) || 4,
  },
};

export default nextConfig;
