"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { War3ModelViewer } from "@/lib/tve4-model-demo/viewer";
import type { ModelDemoEntry } from "@/lib/tve4-model-demo/manifest";
import {
  defaultHeroModel,
  hasAvailableTexture,
  hasCompleteActions,
  heroModelsForFaction,
  loadHeroModelManifest,
} from "@/lib/tve4/model-catalog";
import type { Faction } from "@/lib/tve4/types";

interface HeroModelPickerProps {
  faction: Faction;
  selectedModelId: string | null;
  onConfirm: (modelId: string) => void;
  onBack: () => void;
}

function teamColor(faction: Faction): [number, number, number] {
  const hex = faction === "elf" ? 0x62c77b : 0xe07a4f;
  return [(hex >> 16) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

export function HeroModelPicker({ faction, selectedModelId, onConfirm, onBack }: HeroModelPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<War3ModelViewer | null>(null);
  const [models, setModels] = useState<ModelDemoEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(selectedModelId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewReady, setPreviewReady] = useState(false);

  const candidates = useMemo(() => heroModelsForFaction(models, faction), [models, faction]);
  const selectedEntry = candidates.find((entry) => entry.id === selectedId) ?? null;
  const hasPreview = Boolean(selectedEntry);

  useEffect(() => {
    let cancelled = false;
    loadHeroModelManifest()
      .then((entries) => {
        if (cancelled) return;
        setModels(entries);
        setSelectedId((current) => {
          if (current && heroModelsForFaction(entries, faction).some((entry) => entry.id === current)) return current;
          return defaultHeroModel(entries, faction)?.id ?? null;
        });
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [faction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewer = new War3ModelViewer(canvas, (snapshot) => setPreviewReady(snapshot.ready));
    viewerRef.current = viewer;
    viewer.setTeamColor(teamColor(faction));
    return () => {
      viewer.destroy();
      viewerRef.current = null;
      setPreviewReady(false);
    };
  }, [faction, hasPreview]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedEntry) return;
    setPreviewReady(false);
    void viewer.load(selectedEntry).then(() => viewer.setPlaying(true));
  }, [selectedEntry]);

  return (
    <div className="absolute inset-0 z-50 flex h-dvh flex-col bg-[#07100b] text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button className="rounded-lg bg-white/10 px-3 py-2 text-xs" onClick={onBack}>返回</button>
        <div>
          <div className="text-sm font-semibold">选择{faction === "elf" ? "精灵" : "巨魔"}英雄模型</div>
          <div className="text-[10px] text-white/45">仅替换玩家英雄外观，不影响数值、碰撞与 AI</div>
        </div>
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-rose-200">{error}</div>
      ) : (
        <>
          <div className="relative h-52 shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_50%_40%,#26323a_0%,#11181d_55%,#070b0e_100%)]">
            <canvas ref={canvasRef} data-preview-ready={previewReady ? "true" : "false"} className="h-full w-full touch-none" />
            {!selectedEntry ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#11181d] text-xs text-white/45">正在加载可选模型…</div>
            ) : !previewReady ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/45">正在加载模型…</div>
            ) : null}
            {selectedEntry ? (
              <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-black/55 px-2 py-1 text-[10px] text-white/70">
                {selectedEntry.id} · {selectedEntry.label}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? <div className="py-8 text-center text-xs text-white/50">正在加载模型清单…</div> : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {candidates.map((entry) => (
                <button
                  key={entry.id}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${selectedId === entry.id ? "border-emerald-400 bg-emerald-900/40" : "border-white/10 bg-white/5"}`}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <div className="font-semibold">{entry.id} · {entry.label}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                    <span className={`rounded px-1 py-0.5 ${hasAvailableTexture(entry) ? "bg-amber-900/60 text-amber-100" : "bg-neutral-800 text-neutral-300"}`}>
                      {hasAvailableTexture(entry) ? "原始贴图" : "灰模"}
                    </span>
                    <span className={`rounded px-1 py-0.5 ${hasCompleteActions(entry) ? "bg-emerald-900/60 text-emerald-100" : "bg-rose-900/60 text-rose-100"}`}>
                      {hasCompleteActions(entry) ? "动作完整" : "缺动作"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 p-3">
            <button
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold disabled:opacity-40"
              disabled={loading || Boolean(error) || !selectedEntry}
              onClick={() => {
                if (selectedEntry) onConfirm(selectedEntry.id);
              }}
            >
              使用此外观进入地图
            </button>
          </div>
        </>
      )}
    </div>
  );
}