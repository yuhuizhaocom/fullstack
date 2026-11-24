"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  CLIP_KIND_IMAGE,
  CLIP_KIND_TEXT,
  CLIP_MAX_LENGTH,
  type ClipKind,
  type ClipPayload,
} from "@/lib/clip/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = "connecting" | "online" | "offline";

const CLIENT_KEY = "tf_clip_client";
const AUTO_COPY_KEY = "tf_clip_autocopy";
const AUTO_READ_KEY = "tf_clip_autoread";
const POLL_INTERVAL = 2500;
const IMAGE_MAX_SIZE = 100 * 1024 * 1024;

export function ClipRoom({ channel }: { channel: string }) {
  const [entries, setEntries] = useState<ClipPayload[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [autoCopy, setAutoCopy] = useState(true);
  const [autoRead, setAutoRead] = useState(false);
  const [loading, setLoading] = useState(true);

  const clientIdRef = useRef("");
  const autoCopyRef = useRef(true);
  const lastSentRef = useRef("");
  const lastRemoteRef = useRef("");
  const pendingRemoteRef = useRef("");
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

  // 拉取历史并与本地合并（倒序：最新在前），用于初始加载与后台恢复补齐
  const refreshHistory = useCallback(
    async (silent = false) => {
      try {
        const response = await fetch(`/api/clip/${channel}/messages`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("history failed");
        const data = await response.json();
        const list: ClipPayload[] = Array.isArray(data.entries)
          ? data.entries
          : [];
        setEntries((prev) => {
          const map = new Map(prev.map((item) => [item.id, item]));
          for (const item of list) map.set(item.id, item);
          return [...map.values()].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt)
          );
        });
      } catch {
        if (!silent) toast.error("读取历史失败，请刷新重试");
      } finally {
        setLoading(false);
      }
    },
    [channel]
  );

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  /**
   * 自动写入剪贴板：
   * 1) 页面不可见时先挂起，恢复可见/聚焦后再补写；
   * 2) 写入前读取当前剪贴板，内容一致则跳过，避免重复写入；
   * 3) 读取权限不可用时降级为直接写入。
   */
  const tryAutoWrite = useCallback(async () => {
    const content = pendingRemoteRef.current;
    if (!content || !autoCopyRef.current) return;
    if (typeof navigator.clipboard?.writeText !== "function") return;
    if (!document.hasFocus() || document.visibilityState !== "visible") return;

    if (typeof navigator.clipboard.readText === "function") {
      try {
        const current = await navigator.clipboard.readText();
        if (current === content) {
          pendingRemoteRef.current = "";
          lastRemoteRef.current = content;
          return;
        }
      } catch {
        // 没有读取权限时继续尝试写入
      }
    }

    try {
      await navigator.clipboard.writeText(content);
      lastRemoteRef.current = content;
      pendingRemoteRef.current = "";
    } catch {
      if (!warnedRef.current) {
        warnedRef.current = true;
        toast.error("自动写入剪贴板失败，请手动点击复制");
      }
    }
  }, []);

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

        // 图片无法写入剪贴板文本，只有文本参与自动写入
        if (
          entry.clientId !== clientIdRef.current &&
          entry.kind !== CLIP_KIND_IMAGE &&
          autoCopyRef.current
        ) {
          pendingRemoteRef.current = entry.content;
          void tryAutoWrite();
        }
      } catch {
        // 忽略心跳等非 JSON 帧
      }
    };

    return () => source.close();
  }, [channel, tryAutoWrite]);

  // 页面从后台恢复时：补写待处理内容，并重新同步历史，避免 SSE 断线漏消息
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void tryAutoWrite();
      void refreshHistory(true);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshHistory, tryAutoWrite]);

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

    // 后台恢复时立即检查一次，不必等下一个轮询周期
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };

    void tick();
    const timer = setInterval(tick, POLL_INTERVAL);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // postContent 是稳定的（仅依赖 channel）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, channel]);

  async function postContent(
    content: string,
    kind: ClipKind = CLIP_KIND_TEXT
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/clip/${channel}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, clientId: clientIdRef.current, kind }),
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

  /** 图片先上传到附件存储（scope=clip，不进附件列表），再发一条图片消息 */
  async function sendImage(file: File) {
    if (uploadingImage) return;
    if (!file.type.startsWith("image/")) {
      toast.error("不支持的图片格式");
      return;
    }
    if (file.size > IMAGE_MAX_SIZE) {
      toast.error("图片不能超过 100MB");
      return;
    }

    setUploadingImage(true);
    try {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1] || "png";
      const upload = await fetch("/api/files", {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(`clipboard-${Date.now()}.${ext}`),
          "x-file-type": file.type,
          "x-file-scope": "clip",
        },
        body: file,
      });

      if (!upload.ok) {
        const data = await upload.json().catch(() => null);
        toast.error(data?.error ?? "图片上传失败");
        return;
      }

      const data = await upload.json();
      const url: string | undefined = data?.file?.downloadUrl;
      if (!url) {
        toast.error("图片上传失败");
        return;
      }

      if (await postContent(url, CLIP_KIND_IMAGE)) {
        toast.success("图片已发到频道");
        void refreshHistory(true);
      }
    } catch {
      toast.error("图片发送失败，请稍后重试");
    } finally {
      setUploadingImage(false);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    void sendImage(file);
  }

  async function readClipboard() {
    // 优先尝试读取剪贴板图片（浏览器支持时）
    if (typeof navigator.clipboard?.read === "function") {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((value) => value.startsWith("image/"));
          if (type) {
            const blob = await item.getType(type);
            await sendImage(
              new File([blob], "clipboard.png", { type })
            );
            return;
          }
        }
      } catch {
        // 无图片或未授权，回退文本读取
      }
    }

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
              同一频道的成员会实时收到彼此发送的文本与图片
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
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="在这里粘贴或输入内容，Ctrl / ⌘ + Enter 发送；粘贴图片会直接发送图片"
            className="min-h-28 resize-y font-mono text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={readClipboard}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ClipboardPaste className="size-3.5" />
                )}
                {uploadingImage ? "图片上传中" : "粘贴剪贴板"}
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
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {autoRead
              ? "自动读取每 2.5 秒检查一次剪贴板，页面从后台恢复时会立即补检；仅支持文本，图片请直接粘贴发送。"
              : "支持直接粘贴截图发送；图片与文本均 24 小时后清理。"}
          </p>
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
                const isImage = entry.kind === CLIP_KIND_IMAGE;
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
                        {isImage && " · 图片"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        title={isImage ? "复制图片链接" : "复制内容"}
                        aria-label={isImage ? "复制图片链接" : "复制内容"}
                        onClick={() =>
                          copy(
                            isImage
                              ? `${window.location.origin}${entry.content}`
                              : entry.content
                          )
                        }
                      >
                        <ClipboardCopy className="size-3.5" />
                      </Button>
                    </div>
                    {isImage ? (
                      <a
                        href={entry.content}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-fit"
                      >
                        <img
                          src={`${entry.content}?inline=1`}
                          alt="剪贴板图片"
                          className="max-h-64 max-w-full rounded-md border object-contain"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                        {entry.content}
                      </pre>
                    )}
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
