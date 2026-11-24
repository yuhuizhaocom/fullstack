import type { NextRequest } from "next/server";

import { subscribeChat } from "@/lib/chat/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

      send("retry: 3000\n\n");
      send("event: ready\ndata: {}\n\n");

      unsubscribe = subscribeChat((event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      // 心跳，避免 Cloudflare / 中间层因空闲断流
      heartbeat = setInterval(() => send(": ping\n\n"), 25_000);

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
