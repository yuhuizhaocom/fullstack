"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { MODEL_GROUP_LABELS, MODEL_GROUP_ORDER, type ModelGroup } from "@/lib/tve4-model-demo/catalog";
import type { ModelDemoEntry } from "@/lib/tve4-model-demo/manifest";
import { classifySequence, type ActionKey } from "@/lib/tve4-model-demo/sequences";
import { hexToRgb, PROCEDURAL_PALETTES } from "@/lib/tve4-model-demo/procedural-texture";
import { War3ModelViewer, type ViewerSnapshot } from "@/lib/tve4-model-demo/viewer";

interface ModelDemoManifest {
  generatedFrom: string;
  models: ModelDemoEntry[];
}

interface DemoSnapshot extends ViewerSnapshot {
  selectedModelId: string;
}

declare global {
  interface Window {
    __MODEL_DEMO__?: {
      getSnapshot: () => DemoSnapshot;
      setModel: (id: string) => void;
      setSequence: (index: number) => void;
      setPlaying: (playing: boolean) => void;
      setSpeed: (speed: number) => void;
      scrub: (frame: number) => void;
    };
  }
}

const emptySnapshot: ViewerSnapshot = {
  ready: false,
  modelId: null,
  sequenceIndex: 0,
  sequenceName: "",
  frame: 0,
  duration: 0,
  playing: true,
  speed: 1,
  fps: 0,
  loadedTextures: 0,
  availableTextures: 0,
  missingTextures: 0,
  textureEnabled: true,
  procedural: false,
  wireframe: false,
  showSkeleton: false,
  error: "",
};

const actionLabels: { key: ActionKey; label: string }[] = [
  { key: "stand", label: "待机" },
  { key: "walk", label: "移动" },
  { key: "attack", label: "攻击" },
  { key: "death", label: "死亡" },
];

export function ModelDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<War3ModelViewer | null>(null);
  const controlsRef = useRef({
    setModel: (_id: string) => {},
    setSequence: (_index: number) => {},
    setPlaying: (_playing: boolean) => {},
    setSpeed: (_speed: number) => {},
    scrub: (_frame: number) => {},
  });
  const [manifest, setManifest] = useState<ModelDemoManifest | null>(null);
  const [manifestError, setManifestError] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("m001");
  const [activeGroup, setActiveGroup] = useState<ModelGroup>("troll");
  const [selectedSequenceIndex, setSelectedSequenceIndex] = useState(0);
  const [viewerReady, setViewerReady] = useState(false);
  const [snapshot, setSnapshot] = useState<ViewerSnapshot>(emptySnapshot);
  const [teamColor, setTeamColor] = useState("#e8593c");
  const [estimatedHitRatio, setEstimatedHitRatio] = useState(0.55);
  const [proceduralEnabled, setProceduralEnabled] = useState(true);
  const [paletteSelections, setPaletteSelections] = useState<Record<string, string>>({});

  const groupModels = useMemo(
    () => manifest?.models.filter((model) => model.group === activeGroup) ?? [],
    [manifest, activeGroup],
  );
  const selectedEntry = useMemo(() => {
    const selected = manifest?.models.find((model) => model.id === selectedModelId);
    return selected?.group === activeGroup ? selected : groupModels[0] ?? null;
  }, [manifest, selectedModelId, activeGroup, groupModels]);
  const selectedSequence = selectedEntry?.sequences[selectedSequenceIndex] ?? selectedEntry?.sequences[0] ?? null;
  const palettes = selectedEntry ? PROCEDURAL_PALETTES[selectedEntry.id] ?? [] : [];
  const selectedPalette = palettes.find((palette) => palette.id === paletteSelections[selectedEntry?.id ?? ""]) ?? palettes[0] ?? null;

  useEffect(() => {
    fetch("/tve4-model-demo/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ModelDemoManifest>;
      })
      .then(setManifest)
      .catch((error) => setManifestError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewer = new War3ModelViewer(canvas, setSnapshot);
    viewerRef.current = viewer;
    setViewerReady(true);
    return () => {
      viewer.destroy();
      viewerRef.current = null;
      setViewerReady(false);
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || !selectedEntry) return;
    setSelectedSequenceIndex(selectedEntry.actions.stand?.index ?? 0);
    void viewer.load(selectedEntry).then(() => viewer.setPlaying(true));
  }, [selectedEntry, viewerReady]);

  useEffect(() => {
    viewerRef.current?.setTeamColor(hexToRgb(teamColor));
  }, [teamColor, selectedEntry, viewerReady]);

  useEffect(() => {
    viewerRef.current?.setProceduralPalette(proceduralEnabled ? selectedPalette : null);
  }, [proceduralEnabled, selectedPalette, selectedEntry, viewerReady]);

  const selectSequence = (index: number) => {
    setSelectedSequenceIndex(index);
    viewerRef.current?.setSequence(index);
  };

  const selectAction = (action: ActionKey) => {
    const match = selectedEntry?.actions[action];
    if (!match) return;
    selectSequence(match.index);
    viewerRef.current?.setPlaying(true);
  };

  const setModel = (id: string) => {
    const model = manifest?.models.find((item) => item.id === id);
    if (model) setActiveGroup(model.group);
    setSelectedModelId(id);
  };

  const selectGroup = (group: ModelGroup) => {
    const first = manifest?.models.find((model) => model.group === group);
    setActiveGroup(group);
    if (first) setSelectedModelId(first.id);
  };

  controlsRef.current = {
    setModel,
    setSequence: selectSequence,
    setPlaying: (playing) => viewerRef.current?.setPlaying(playing),
    setSpeed: (speed) => viewerRef.current?.setSpeed(speed),
    scrub: (frame) => viewerRef.current?.setFrame(frame),
  };

  useEffect(() => {
    window.__MODEL_DEMO__ = {
      getSnapshot: () => ({
        ...(viewerRef.current?.getSnapshot() ?? emptySnapshot),
        selectedModelId,
      }),
      setModel: (id) => controlsRef.current.setModel(id),
      setSequence: (index) => controlsRef.current.setSequence(index),
      setPlaying: (playing) => controlsRef.current.setPlaying(playing),
      setSpeed: (speed) => controlsRef.current.setSpeed(speed),
      scrub: (frame) => controlsRef.current.scrub(frame),
    };
    return () => {
      delete window.__MODEL_DEMO__;
    };
  }, [selectedModelId]);

  const eventTimes = useMemo(() => {
    if (!selectedEntry || !selectedSequence) return [];
    return selectedEntry.events
      .flatMap((event) => event.times)
      .map((time) => time - selectedSequence.start)
      .filter((time) => time >= 0 && time <= selectedSequence.end - selectedSequence.start)
      .sort((a, b) => a - b);
  }, [selectedEntry, selectedSequence]);

  const hitTime = eventTimes[0] ?? (selectedSequence && classifySequence(selectedSequence.name) === "attack"
    ? (selectedSequence.end - selectedSequence.start) * estimatedHitRatio
    : null);
  const hitRatio = hitTime !== null && selectedSequence
    ? hitTime / (selectedSequence.end - selectedSequence.start)
    : null;
  const textureTotal = snapshot.availableTextures + snapshot.missingTextures;
  const rangeMin = selectedSequence?.start ?? 0;
  const rangeMax = selectedSequence?.end ?? 1;

  return (
    <main className="h-dvh w-full overflow-hidden bg-[#070b0e] text-white">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <section className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_35%,#26323a_0%,#11181d_45%,#070b0e_100%)]">
          <canvas ref={canvasRef} className="h-full w-full touch-none cursor-grab active:cursor-grabbing" />
          <div className="pointer-events-none absolute left-5 top-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/60">War3 Model Lab</div>
            <h1 className="mt-1 text-xl font-semibold">原版模型动画验证</h1>
            <p className="mt-1 text-xs text-white/45">拖动旋转 · 滚轮缩放 · 直接播放 MDX 原始骨骼动画</p>
          </div>
          <Link href="/tve4" className="absolute right-5 top-5 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-white/70 hover:bg-black/50">
            返回 tve4
          </Link>
          {!snapshot.ready && !snapshot.error ? (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/60">正在解析模型…</div>
          ) : null}
          {snapshot.error ? (
            <div className="absolute left-1/2 top-24 w-[min(90%,560px)] -translate-x-1/2 rounded-xl border border-rose-400/30 bg-rose-950/70 p-4 text-xs leading-6 text-rose-100">
              <div className="font-semibold">加载出现问题</div>
              <div className="mt-1 break-words">{snapshot.error}</div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-5 left-5 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-xs text-white/60 backdrop-blur">
            <div><span className="text-white/85">{snapshot.sequenceName || "—"}</span> · {snapshot.fps} FPS</div>
            <div className="mt-1 font-mono text-[11px] text-white/45">{Math.round(snapshot.frame)} / {rangeMax} ms</div>
          </div>
        </section>

        <aside className="h-[46dvh] shrink-0 overflow-y-auto border-t border-white/10 bg-[#0b1115] p-4 lg:h-full lg:w-[390px] lg:border-l lg:border-t-0">
          {manifestError ? <div className="text-sm text-rose-300">资源清单加载失败：{manifestError}</div> : null}
          {!manifest ? <div className="text-sm text-white/50">读取资源清单…</div> : null}
          {manifest && selectedEntry ? (
            <div className="space-y-5">
              <div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MODEL_GROUP_ORDER.map((group) => {
                    const count = manifest.models.filter((model) => model.group === group).length;
                    return (
                      <button
                        key={group}
                        onClick={() => selectGroup(group)}
                        className={`rounded-lg border px-2 py-2 text-center transition ${
                          activeGroup === group
                            ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-50"
                            : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="text-[11px] font-medium">{MODEL_GROUP_LABELS[group]}</div>
                        <div className="mt-0.5 text-[9px] text-white/30">{count}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mb-2 mt-4 flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{MODEL_GROUP_LABELS[activeGroup]}</div>
                  <div className="text-[10px] text-white/30">{groupModels.length} 个模型</div>
                </div>
                <div className="mb-2 truncate text-xs text-white/70">
                  {String(selectedEntry.number).padStart(3, "0")} · {selectedEntry.label}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {groupModels.map((model) => (
                    <button
                      key={model.id}
                      title={model.label}
                      onClick={() => setModel(model.id)}
                      className={`min-w-0 rounded-lg border px-1 py-2 text-center transition ${
                        model.id === selectedEntry.id
                          ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-50"
                          : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="text-sm font-semibold">{String(model.number).padStart(3, "0")}</div>
                      <div className="mt-1 truncate text-[8px] text-white/35">{model.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {activeGroup === "troll" || activeGroup === "elf" || activeGroup === "other-characters" ? (
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">动作</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {actionLabels.map((action) => {
                      const match = selectedEntry.actions[action.key];
                      return (
                        <button
                          key={action.key}
                          disabled={!match}
                          onClick={() => selectAction(action.key)}
                          className={`rounded-lg border px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-30 ${
                            match && selectedSequenceIndex === match.index
                              ? "border-amber-300/50 bg-amber-300/10 text-amber-100"
                              : "border-white/10 bg-white/[0.03] text-white/65"
                          }`}
                        >
                          {action.label}
                          {match?.proxy ? <span className="ml-1 text-[9px] text-amber-300/70">代理</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/40">
                  该分组按模型自带序列预览，不使用角色动作按钮。
                </div>
              )}

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/40" htmlFor="sequence">全部序列</label>
                <select
                  id="sequence"
                  value={selectedSequenceIndex}
                  onChange={(event) => selectSequence(Number(event.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-[#111a20] px-3 py-2 text-xs text-white/80 outline-none focus:border-cyan-300/40"
                >
                  {selectedEntry.sequences.map((sequence, index) => (
                    <option key={`${sequence.name}-${index}`} value={index}>
                      {index} · {sequence.name} · {sequence.end - sequence.start}ms{sequence.nonLooping ? " · 单次" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => viewerRef.current?.togglePlaying()}
                    className="rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-950 hover:bg-cyan-200"
                  >
                    {snapshot.playing ? "暂停" : "播放"}
                  </button>
                  <div className="flex gap-1">
                    {[0.25, 0.5, 1, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => viewerRef.current?.setSpeed(speed)}
                        className={`rounded-md px-2 py-1.5 text-[11px] ${snapshot.speed === speed ? "bg-white/15 text-white" : "text-white/40 hover:bg-white/5"}`}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                  <button onClick={() => viewerRef.current?.resetCamera()} className="ml-auto text-[11px] text-white/40 hover:text-white/70">重置视角</button>
                </div>
                <div className="relative mt-4">
                  <input
                    aria-label="动画时间轴"
                    type="range"
                    min={rangeMin}
                    max={rangeMax}
                    step={1}
                    value={Math.round(snapshot.frame)}
                    onChange={(event) => viewerRef.current?.setFrame(Number(event.target.value))}
                    className="w-full accent-cyan-300"
                  />
                  {hitRatio !== null ? (
                    <div className="pointer-events-none absolute top-[-3px] h-3 w-px bg-amber-300" style={{ left: `${hitRatio * 100}%` }} />
                  ) : null}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-white/35">
                  <span>{rangeMin}</span><span>{rangeMax}</span>
                </div>
                {hitTime !== null ? (
                  <div className="mt-3 rounded-lg bg-amber-300/[0.07] p-2 text-[11px] text-amber-100/70">
                    命中点 {Math.round(hitTime)}ms{eventTimes.length ? "（来自 MDX 事件）" : "（估算，可调）"}
                    {eventTimes.length === 0 ? (
                      <input
                        aria-label="估算命中点"
                        type="range"
                        min={0.1}
                        max={0.9}
                        step={0.01}
                        value={estimatedHitRatio}
                        onChange={(event) => setEstimatedHitRatio(Number(event.target.value))}
                        className="mt-2 w-full accent-amber-300"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              {palettes.length > 0 && selectedPalette ? (
                <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-cyan-100">原创配色</div>
                      <div className="mt-1 text-[10px] text-white/35">程序化风格化贴图，可实时切换</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={proceduralEnabled}
                      onChange={(event) => setProceduralEnabled(event.target.checked)}
                      className="accent-cyan-300"
                    />
                  </div>
                  <select
                    aria-label="原创配色"
                    value={selectedPalette.id}
                    disabled={!proceduralEnabled}
                    onChange={(event) =>
                      setPaletteSelections((current) => ({ ...current, [selectedEntry.id]: event.target.value }))
                    }
                    className="mt-3 w-full rounded-lg border border-white/10 bg-[#111a20] px-3 py-2 text-xs text-white/75 outline-none disabled:opacity-40"
                  >
                    {palettes.map((palette) => (
                      <option key={palette.id} value={palette.id}>{palette.label}</option>
                    ))}
                  </select>
                  <div className="mt-2 flex gap-1.5">
                    {selectedPalette.colors.map((color) => (
                      <span key={color} className="h-5 flex-1 rounded" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-white/60">
                  贴图
                  <input type="checkbox" checked={snapshot.textureEnabled} onChange={(event) => viewerRef.current?.setTextureEnabled(event.target.checked)} className="accent-cyan-300" />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-white/60">
                  线框
                  <input type="checkbox" checked={snapshot.wireframe} onChange={(event) => viewerRef.current?.setWireframe(event.target.checked)} className="accent-cyan-300" />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-white/60">
                  骨骼
                  <input type="checkbox" checked={snapshot.showSkeleton} onChange={(event) => viewerRef.current?.setShowSkeleton(event.target.checked)} className="accent-cyan-300" />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-white/60">
                  队色
                  <input type="color" value={teamColor} onChange={(event) => setTeamColor(event.target.value)} className="h-5 w-7 border-0 bg-transparent p-0" />
                </label>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] leading-6 text-white/45">
                <div className="mb-1 font-semibold text-white/65">诊断</div>
                <div>MDX{selectedEntry.version} · {selectedEntry.geometryCount} geosets · {selectedEntry.boneCount} bones</div>
                <div>分组 {MODEL_GROUP_LABELS[selectedEntry.group]}</div>
                <div className="break-all text-white/30">来源 {selectedEntry.sourceFile}</div>
                {selectedEntry.parseError ? <div className="break-all text-rose-300/70">解析失败：{selectedEntry.parseError}</div> : null}
                <div>贴图 {snapshot.loadedTextures}/{textureTotal} 已加载 · {snapshot.missingTextures} 个原文件缺失</div>
                <div>当前序列 {selectedSequence?.nonLooping ? "单次" : "循环"} · 原始时长 {snapshot.duration}ms</div>
                <div className="break-all text-white/30">SHA-256 {selectedEntry.sha256.slice(0, 16)}…</div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
