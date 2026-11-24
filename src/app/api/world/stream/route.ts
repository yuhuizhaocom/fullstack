import type { NextRequest } from "next/server";

import {
  getWorldSnapshot,
  subscribeWorld,
  touchPlayer,
  worldInfo,
} from "@/lib/world/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
  if (!clientId) {
    return new Response("缺少客户端标识", { status: 400 });
  }

  touchPlayer(clientId);

  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // 连接已关闭
        }
      };

      send("retry: 2000\n\n");
      send(`event: ready\ndata: ${JSON.stringify(worldInfo())}\n\n`);
      send(`data: ${JSON.stringify(getWorldSnapshot())}\n\n`);

      unsubscribe = subscribeWorld((snapshot) => {
        send(`data: ${JSON.stringify(snapshot)}\n\n`);
      });

      heartbeat = setInterval(() => {
        touchPlayer(clientId);
        send(": ping\n\n");
      }, 5_000);

      const close = () => {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      };

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
