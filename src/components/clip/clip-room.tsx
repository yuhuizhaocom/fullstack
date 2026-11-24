"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardCopy,
  ClipboardPaste,
  Link2,
  Loader2,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CLIP_MAX_LENGTH, type ClipPayload } from "@/lib/clip/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = "connecting" | "online" | "offline";

const CLIENT_KEY = "tf_clip_client";
const AUTO_COPY_KEY = "tf_clip_autocopy";
const AUTO_READ_KEY = "tf_clip_autoread";
const POLL_INTERVAL = 2500;

export function ClipRoom({ channel }: { channel: string }) {
  const [entries, setEntries] = useState<ClipPayload[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [sending, setSending] = useState(false);
  const [autoCopy, setAutoCopy] = useState(true);
  const [autoRead, setAutoRead] = useState(false);
  const [loading, setLoading] = useState(true);

  const clientIdRef = useRef("");
  const autoCopyRef = useRef(true);
  const lastSentRef = useRef("");
  const lastRemoteRef = useRef("");
  const readFailuresRef = useRef(0);
  const warnedRef = useRef(false);

  // 初始化匿名客户端标识与本地偏好
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

    if (localStorage.getItem(AUTO_COPY_KEY) === "off") {
      setAutoCopy(false);
      autoCopyRef.current = false;
    }
    if (localStorage.getItem(AUTO_READ_KEY) === "on") {
      setAutoRead(true);
    }
  }, []);

  // 读取历史（倒序：最新在前）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/clip/${channel}/messages`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("history failed");
        const data = await response.json();
        const list: ClipPayload[] = Array.isArray(data.entries)
          ? data.entries
          : [];
        if (!cancelled) setEntries([...list].reverse());
      } catch {
        if (!cancelled) toast.error("读取历史失败，请刷新重试");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  // 订阅实时消息
  useEffect(() => {
    const source = new EventSource(`/api/clip/${channel}/stream`);

    source.onopen = () => setStatus("online");
    source.onerror = () => setStatus("offline");

    source.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as ClipPayload;
        setEntries((prev) =>
          prev.some((item) => item.id === entry.id) ? prev : [entry, ...prev]
        );

        if (
          entry.clientId !== clientIdRef.current &&
          autoCopyRef.current &&
          document.hasFocus() &&
          typeof navigator.clipboard?.writeText === "function"
        ) {
          navigator.clipboard
            .writeText(entry.content)
            .then(() => {
              lastRemoteRef.current = entry.content;
            })
            .catch(() => {
              if (!warnedRef.current) {
                warnedRef.current = true;
                toast.error("自动写入剪贴板失败，请手动点击复制");
              }
            });
        }
      } catch {
        // 忽略心跳等非 JSON 帧
      }
    };

    return () => source.close();
  }, [channel]);

  // 自动读取剪贴板并发送（需 HTTPS + 权限 + 页面在前台）
  useEffect(() => {
    if (!autoRead) return;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (!document.hasFocus() || document.visibilityState !== "visible") return;
      if (typeof navigator.clipboard?.readText !== "function") return;

      try {
        const value = (await navigator.clipboard.readText()).slice(
          0,
          CLIP_MAX_LENGTH
        );
        readFailuresRef.current = 0;

        if (!value.trim()) return;
        if (value === lastSentRef.current) return;
        if (value === lastRemoteRef.current) return;

        lastSentRef.current = value;
        await postContent(value);
      } catch {
        readFailuresRef.current += 1;
        if (readFailuresRef.current >= 3) {
          setAutoRead(false);
          localStorage.setItem(AUTO_READ_KEY, "off");
          toast.error("自动读取剪贴板被浏览器拒绝，已关闭；可手动粘贴或允许权限后重开");
        }
      }
    };

    void tick();
    const timer = setInterval(tick, POLL_INTERVAL);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // postContent 是稳定的（仅依赖 channel）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, channel]);

  async function postContent(content: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/clip/${channel}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, clientId: clientIdRef.current }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error ?? "发送失败，请稍后重试");
        return false;
      }
      return true;
    } catch {
      toast.error("网络异常，发送失败");
      return false;
    }
  }

  async function send() {
    const content = text.trim();
    if (!content) {
      toast.error("请先粘贴或输入内容");
      return;
    }

    setSending(true);
    try {
      if (await postContent(content)) {
        lastSentRef.current = content;
        setText("");
      }
    } finally {
      setSending(false);
    }
  }

  async function readClipboard() {
    if (!navigator.clipboard?.readText) {
      toast.error("当前浏览器不支持读取剪贴板");
      return;
    }
    try {
      const value = await navigator.clipboard.readText();
      if (!value) {
        toast.error("剪贴板为空");
        return;
      }
      setText(value.slice(0, CLIP_MAX_LENGTH));
    } catch {
      toast.error("读取剪贴板被拒绝，请允许剪贴板权限或手动粘贴");
    }
  }

  async function copy(content: string) {
    if (!navigator.clipboard?.writeText) {
      toast.error("当前浏览器不支持写入剪贴板");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  }

  function toggleAutoCopy() {
    const next = !autoCopy;
    setAutoCopy(next);
    autoCopyRef.current = next;
    localStorage.setItem(AUTO_COPY_KEY, next ? "on" : "off");
  }

  async function toggleAutoRead() {
    if (autoRead) {
      setAutoRead(false);
      localStorage.setItem(AUTO_READ_KEY, "off");
      return;
    }

    if (!navigator.clipboard?.readText) {
      toast.error("当前浏览器不支持自动读取剪贴板");
      return;
    }

    // 触发一次读取，未授权时浏览器会弹出权限请求
    try {
      const value = await navigator.clipboard.readText();
      setAutoRead(true);
      localStorage.setItem(AUTO_READ_KEY, "on");
      readFailuresRef.current = 0;
      if (value.trim() && value !== lastSentRef.current) {
        lastSentRef.current = value.slice(0, CLIP_MAX_LENGTH);
        await postContent(value.slice(0, CLIP_MAX_LENGTH));
      }
    } catch {
      toast.error("无法读取剪贴板，请允许权限后重试");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            <CardTitle className="font-mono text-lg uppercase tracking-[0.2em]">
              {channel}
            </CardTitle>
            <CardDescription className="mt-1">
              同一频道的成员会实时收到彼此发送的剪贴板内容
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copy(window.location.href)}
            >
              <Link2 className="size-3.5" />
              复制链接
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="space-y-3 p-4">
          <Textarea
            value={text}
            onChange={(event) =>
              setText(event.target.value.slice(0, CLIP_MAX_LENGTH))
            }
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="在这里粘贴或输入内容，Ctrl / ⌘ + Enter 发送"
            className="min-h-28 resize-y font-mono text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={readClipboard}
              >
                <ClipboardPaste className="size-3.5" />
                粘贴剪贴板
              </Button>
              <Button
                type="button"
                variant={autoRead ? "secondary" : "outline"}
                size="sm"
                onClick={toggleAutoRead}
              >
                自动读取：{autoRead ? "开" : "关"}
              </Button>
              <Button
                type="button"
                variant={autoCopy ? "secondary" : "outline"}
                size="sm"
                onClick={toggleAutoCopy}
              >
                自动写入：{autoCopy ? "开" : "关"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {text.length} / {CLIP_MAX_LENGTH}
              </span>
            </div>
            <Button type="button" size="sm" onClick={send} disabled={sending}>
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              发送
            </Button>
          </div>
          {autoRead && (
            <p className="text-[11px] text-muted-foreground">
              自动读取每 2.5 秒检查一次剪贴板，仅在当前标签页处于前台时生效；首次使用需允许剪贴板权限。
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">历史记录</CardTitle>
          <CardDescription>
            按时间倒序，最近 50 条，24 小时后自动清理；点击右侧图标可复制
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载中
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              还没有内容，粘贴后点击「发送」试试
            </p>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {entries.map((entry) => {
                const mine = entry.clientId === clientIdRef.current;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "rounded-lg border p-3",
                      mine ? "bg-primary/5" : "bg-background"
                    )}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {mine ? "我" : `匿名 ${entry.clientId.slice(0, 4)}`} ·{" "}
                        {formatDateTime(entry.createdAt)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        title="复制内容"
                        aria-label="复制内容"
                        onClick={() => copy(entry.content)}
                      >
                        <ClipboardCopy className="size-3.5" />
                      </Button>
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                      {entry.content}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
