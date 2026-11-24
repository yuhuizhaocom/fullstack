import type { ChatPayload } from "@/lib/chat/constants";

type Listener = (event: ChatPayload) => void;

// 单进程内存广播；多实例部署时需要换成 Redis Pub/Sub
const globalForChat = globalThis as unknown as {
  __chatBus?: Set<Listener>;
};

const listeners = globalForChat.__chatBus ?? new Set<Listener>();
globalForChat.__chatBus = listeners;

export function subscribeChat(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishChat(event: ChatPayload): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[chat] 推送失败:", error);
    }
  }
}
