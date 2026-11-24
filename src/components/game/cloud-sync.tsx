"use client";

import { useEffect, useState } from "react";
import { CloudDownload, CloudUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { persistSave } from "@/lib/game/engine";
import type { GameSave } from "@/lib/game/types";

import { pixelButton, pixelButtonPrimary } from "./panels";

export function CloudSync({
  save,
  onRestore,
}: {
  save: GameSave;
  onRestore: (save: GameSave) => void;
}) {
  const [status, setStatus] = useState<"loading" | "guest" | "ready" | "error">(
    "loading"
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "restore" | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const response = await fetch("/api/game/save", { cache: "no-store" });
      if (response.status === 401) {
        setStatus("guest");
        return;
      }
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setUpdatedAt(data.updatedAt ?? null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  async function upload() {
    setBusy("upload");
    try {
      const response = await fetch("/api/game/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save }),
      });
      if (!response.ok) {
        toast.error(response.status === 401 ? "请先登录" : "上传失败，请稍后重试");
        return;
      }
      const data = await response.json();
      setUpdatedAt(data.updatedAt);
      toast.success("已上传到云端");
    } catch {
      toast.error("网络异常，上传失败");
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!window.confirm("用云端存档覆盖当前角色？本地进度会被替换。")) return;
    setBusy("restore");
    try {
      const response = await fetch("/api/game/save", { cache: "no-store" });
      if (!response.ok) {
        toast.error("读取云存档失败");
        return;
      }
      const data = await response.json();
      if (!data.save) {
        toast.error("云端暂无存档");
        return;
      }
      const next = data.save as GameSave;
      onRestore(next);
      persistSave(next);
      toast.success("已从云端恢复");
    } catch {
      toast.error("网络异常，恢复失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 rounded-lg border-2 border-slate-700 bg-slate-900/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-slate-300">云存档</p>
        {status === "guest" && (
          <span className="text-[10px] text-slate-500">登录后可用</span>
        )}
        {status === "ready" && (
          <span className="text-[10px] text-slate-500">
            {updatedAt
              ? `上次同步 ${new Date(updatedAt).toLocaleString("zh-CN")}`
              : "云端暂无存档"}
          </span>
        )}
      </div>

      {status === "loading" ? (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
          <Loader2 className="size-3 animate-spin" />
          检查登录状态…
        </p>
      ) : status === "guest" ? (
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          登录后可将角色同步到云端，换设备继续冒险；未登录时存档保存在本机浏览器。
        </p>
      ) : status === "error" ? (
        <p className="mt-1 text-[10px] text-rose-400">云存档服务暂不可用。</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={pixelButtonPrimary}
            disabled={busy !== null}
            onClick={upload}
          >
            {busy === "upload" ? (
              <Loader2 className="mr-1 inline size-3 animate-spin" />
            ) : (
              <CloudUpload className="mr-1 inline size-3" />
            )}
            上传当前存档
          </button>
          <button
            type="button"
            className={pixelButton}
            disabled={busy !== null || !updatedAt}
            onClick={restore}
          >
            <CloudDownload className="mr-1 inline size-3" />
            从云端恢复
          </button>
        </div>
      )}
    </div>
  );
}
