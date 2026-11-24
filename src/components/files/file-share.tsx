"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock,
  Download,
  FileUp,
  Link2,
  Loader2,
  UploadCloud,
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
import {
  FILE_MAX_SIZE,
  FILE_TTL_HOURS,
  formatBytes,
  remainingLabel,
  type SharedFilePayload,
} from "@/lib/files/constants";
import { cn } from "@/lib/utils";

const MAX_LABEL = `${FILE_MAX_SIZE / 1024 / 1024}MB`;

export function FileShare({ signedInName }: { signedInName: string | null }) {
  const [files, setFiles] = useState<SharedFilePayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/files", { cache: "no-store" });
      if (!response.ok) throw new Error("list failed");
      const data = await response.json();
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch {
      toast.error("读取附件列表失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 每分钟刷新一次剩余时间文案
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function upload(file: File) {
    if (uploading) {
      toast.error("正在上传，请等待完成");
      return;
    }
    if (file.size === 0) {
      toast.error("文件内容为空");
      return;
    }
    if (file.size > FILE_MAX_SIZE) {
      toast.error(`单个附件不能超过 ${MAX_LABEL}`);
      return;
    }

    setUploading(true);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/files");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-file-type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            file?: SharedFilePayload;
          };
          if (data.file) {
            setFiles((prev) => [data.file as SharedFilePayload, ...prev]);
          }
        } catch {
          void load();
        }
        setProgress(100);
        toast.success("上传成功，已生成下载链接");
      } else {
        let message = "上传失败，请稍后重试";
        try {
          message = JSON.parse(xhr.responseText)?.error ?? message;
        } catch {
          // 非 JSON 响应（如网关拦截）
        }
        toast.error(message);
      }
      if (inputRef.current) inputRef.current.value = "";
    };

    xhr.onerror = () => {
      setUploading(false);
      toast.error("网络异常，上传失败");
    };
    xhr.onabort = () => {
      setUploading(false);
      toast.error("已取消上传");
    };

    xhr.send(file);
  }

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) upload(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  async function copyLink(file: SharedFilePayload) {
    const url = `${window.location.origin}${file.downloadUrl}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("下载链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">上传附件</CardTitle>
          <CardDescription>
            {signedInName
              ? `已登录为 ${signedInName}，单文件上限 ${MAX_LABEL}`
              : `无需登录，单文件上限 ${MAX_LABEL}，游客每小时最多 10 个`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => {
              if (!uploading) inputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!uploading) inputRef.current?.click();
              }
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border bg-background/60 hover:border-primary/50"
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm font-medium">上传中 {progress}%</p>
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">点击选择文件，或拖拽到这里</p>
                <p className="text-[11px] text-muted-foreground">
                  上传后生成下载链接，{FILE_TTL_HOURS} 小时后自动删除
                </p>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handlePick}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            · 任何拿到链接的人都能下载，请勿上传密码、密钥等敏感文件
            <br />· 到期后服务端会删除数据库记录与磁盘文件，无法恢复
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">最近分享</CardTitle>
          <CardDescription>
            最近 30 个未过期附件，按上传时间倒序
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载中
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
              <FileUp className="size-6" />
              还没有附件，上传一个试试
            </div>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => {
                const remaining = remainingLabel(file.expiresAt, now);
                return (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 rounded-lg border bg-background p-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileUp className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span>{formatBytes(file.size)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {remaining ?? "即将过期"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        title="复制下载链接"
                        aria-label="复制下载链接"
                        onClick={() => copyLink(file)}
                      >
                        <Link2 className="size-4" />
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={file.downloadUrl}>
                          <Download className="size-3.5" />
                          下载
                        </a>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
