import { createServer } from "node:http";

import { WebSocketServer } from "ws";

import { attachRealtime, detachRealtime } from "./src/server/realtime";

function readArg(flags: string[]): string | undefined {
  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (flags.includes(arg) && i + 1 < process.argv.length) {
      return process.argv[i + 1];
    }
    for (const flag of flags) {
      if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const dev = process.argv.includes("--dev");
  // Next 依据 NODE_ENV 决定构建/开发模式
  (process.env as Record<string, string | undefined>).NODE_ENV = dev
    ? "development"
    : "production";

  const port = Number(readArg(["-p", "--port"]) ?? process.env.PORT ?? 3000);
  const hostname =
    readArg(["-H", "--hostname"]) ?? process.env.HOSTNAME ?? "0.0.0.0";

  const { default: next } = await import("next");
  const app = next({ dev, hostname, port });
  await app.prepare();

  const handle = app.getRequestHandler();
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  // 实时世界与页面同端口：/ws 走 WebSocket，其余 upgrade（如 HMR）交给 Next
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
  attachRealtime(wss);

  server.on("upgrade", (req, socket, head) => {
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
        .pathname;
    } catch {
      // 忽略非法 URL
    }
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return;
    }
    void upgradeHandler(req, socket, head).catch(() => {
      socket.destroy();
    });
  });

  server.listen(port, hostname, () => {
    console.log(
      `> TaskFlow ${dev ? "dev" : "production"} server ready on http://${hostname}:${port}`
    );
    console.log(`> Realtime WebSocket: ws://${hostname}:${port}/ws (msgpack delta)`);
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`> ${signal} received, shutting down...`);
    detachRealtime();
    wss.close();
    server.close(() => process.exit(0));
    const timer = setTimeout(() => process.exit(0), 3000);
    timer.unref?.();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error) => {
  console.error("[server] 启动失败:", error);
  process.exit(1);
});
