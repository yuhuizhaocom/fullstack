"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CHAT_MAX_LENGTH,
  CHAT_NICKNAME_MAX,
  normalizeNickname,
  type ChatPayload,
} from "@/lib/chat/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = "connecting" | "online" | "offline";

const CLIENT_KEY = "tf_chat_client";
const NICKNAME_KEY = "tf_chat_nickname";

function randomNickname(): string {
  return `访客${Math.floor(1000 + Math.random() * 9000)}`;
}

export function ChatRoom({
  viewer,
}: {
  viewer: { id: string; name: string } | null;
}) {
  const [messages, setMessages] = useState<ChatPayload[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");

  const clientIdRef = useRef("");
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // 初始化匿名客户端标识与本地昵称
  useEffect(() => {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      localStorage.setItem(CLIENT_KEY, id);
    }
    clientIdRef.current = id;

    const saved = localStorage.getItem(NICKNAME_KEY);
    setNickname(saved ? normalizeNickname(saved) || randomNickname() : randomNickname());
  }, []);

  // 昵称变更后写入本地，下次进入沿用
  useEffect(() => {
    if (!nickname) return;
    localStorage.setItem(NICKNAME_KEY, nickname);
  }, [nickname]);

  // 读取历史（升序：旧消息在前）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/chat/messages", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("history failed");
        const data = await response.json();
        const list: ChatPayload[] = Array.isArray(data.messages)
          ? data.messages
          : [];
        if (!cancelled) setMessages(list);
      } catch {
        if (!cancelled) toast.error("读取聊天记录失败，请刷新重试");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 订阅实时消息
  useEffect(() => {
    const source = new EventSource("/api/chat/stream");

    source.onopen = () => setStatus("online");
    source.onerror = () => setStatus("offline");

    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ChatPayload;
        setMessages((prev) =>
          prev.some((item) => item.id === message.id)
            ? prev
            : [...prev, message].slice(-200)
        );
      } catch {
        // 忽略心跳等非 JSON 帧
      }
    };

    return () => source.close();
  }, []);

  // 新消息到达时，若原本就在底部附近则自动滚动到底
  useEffect(() => {
    const list = listRef.current;
    if (!list || !nearBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    nearBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  async function send() {
    const content = text.trim();
    if (!content) {
      toast.error("消息不能为空");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          nickname: viewer ? undefined : nickname,
          clientId: viewer ? undefined : clientIdRef.current,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error ?? "发送失败，请稍后重试");
        return;
      }

      // SSE 断线时也能立即看到自己发出的消息，重连后按 id 去重
      const data = (await response.json().catch(() => null)) as {
        message?: ChatPayload;
      } | null;
      const sent = data?.message;
      if (sent) {
        setMessages((prev) =>
          prev.some((item) => item.id === sent.id)
            ? prev
            : [...prev, sent].slice(-200)
        );
      }

      setText("");
      nearBottomRef.current = true;
    } catch {
      toast.error("网络异常，发送失败");
    } finally {
      setSending(false);
    }
  }

  function isMine(message: ChatPayload): boolean {
    if (viewer) return message.userId === viewer.id;
    return (
      !message.userId &&
      !!clientIdRef.current &&
      message.clientId === clientIdRef.current
    );
  }

  return (
    <Card className="flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col shadow-sm">
      <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 border-b pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">公共大厅</CardTitle>
          <CardDescription className="mt-1">
            {viewer
              ? `已登录为 ${viewer.name}，消息将以账号名展示`
              : "无需登录即可发言，消息显示为「游客·昵称」"}
          </CardDescription>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
            status === "online"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          )}
        >
          {status === "online" ? (
            <Wifi className="size-3" />
          ) : (
            <WifiOff className="size-3" />
          )}
          {status === "online"
            ? "已连接"
            : status === "connecting"
              ? "连接中"
              : "重连中"}
        </span>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg bg-muted/30 p-3"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载消息中
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <MessageSquare className="size-6" />
              还没有人发言，说点什么吧
            </div>
          ) : (
            messages.map((message) => {
              const mine = isMine(message);
              return (
                <div
                  key={message.id}
                  className={cn("flex flex-col", mine ? "items-end" : "items-start")}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-medium">{mine ? "我" : message.sender}</span>
                    <span>·</span>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                      mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm border bg-background"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!viewer && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-muted-foreground">
              游客昵称
            </span>
            <Input
              value={nickname}
              onChange={(event) =>
                setNickname(event.target.value.slice(0, CHAT_NICKNAME_MAX))
              }
              onBlur={() =>
                setNickname((prev) => normalizeNickname(prev) || randomNickname())
              }
              maxLength={CHAT_NICKNAME_MAX}
              placeholder="给自己起个名字"
              className="h-8 max-w-52 text-xs"
            />
            <span className="text-[11px] text-muted-foreground">
              会显示为「游客·{normalizeNickname(nickname) || "匿名"}」
            </span>
          </div>
        )}

        <div className="shrink-0 space-y-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, CHAT_MAX_LENGTH))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="输入消息，Enter 发送，Shift + Enter 换行"
            className="min-h-16 resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {text.length} / {CHAT_MAX_LENGTH}
            </span>
            <Button type="button" size="sm" onClick={send} disabled={sending}>
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              发送
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
