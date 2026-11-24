import type { ClipPayload } from "@/lib/clip/constants";

type Listener = (event: ClipPayload) => void;

// 单进程内存广播；多实例部署时需要换成 Redis Pub/Sub
const globalForBus = globalThis as unknown as {
  __clipBus?: Map<string, Set<Listener>>;
};

const bus = globalForBus.__clipBus ?? new Map<string, Set<Listener>>();
globalForBus.__clipBus = bus;

export function subscribe(channel: string, listener: Listener): () => void {
  let listeners = bus.get(channel);
  if (!listeners) {
    listeners = new Set();
    bus.set(channel, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      bus.delete(channel);
    }
  };
}

export function publish(channel: string, event: ClipPayload): void {
  const listeners = bus.get(channel);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[clip] 推送失败:", error);
    }
  }
}
