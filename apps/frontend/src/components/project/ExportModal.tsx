"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, Clock, DownloadSimple, File, FilmStrip, MonitorPlay, X } from "@phosphor-icons/react";
import { fmt, total } from "@/lib/derive";
import { useStudio } from "@/store/studio";

const RESOLUTIONS = [
  { value: "1080p", label: "1080p — Full HD", dimensions: "1920×1080", factor: 1 },
  { value: "1440p", label: "1440p — sharper screens", dimensions: "2560×1440", factor: 1.75 },
  { value: "4K", label: "4K — Ultra HD", dimensions: "3840×2160", factor: 3.6 },
] as const;

const FORMATS = ["MP4 · H.264", "WebM", "ProRes"] as const;
const QUALITIES = ["High — recommended", "Balanced", "Draft"] as const;

export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const scenes = useStudio((state) => state.sc);
  const sceneIdx = useStudio((state) => state.sceneIdx);
  const source = useStudio((state) => state.source);
  const exportRes = useStudio((state) => state.exportRes);
  const exportFmt = useStudio((state) => state.exportFmt);
  const captions = useStudio((state) => state.captions);
  const chapters = useStudio((state) => state.chapters);
  const renderState = useStudio((state) => state.renderState);
  const renderPct = useStudio((state) => state.renderPct);
  const staleByScene = useStudio((state) => state.staleByScene);
  const setExportRes = useStudio((state) => state.setExportRes);
  const setExportFmt = useStudio((state) => state.setExportFmt);
  const toggleCaptions = useStudio((state) => state.toggleCaptions);
  const toggleChapters = useStudio((state) => state.toggleChapters);
  const setRender = useStudio((state) => state.setRender);
  const [range, setRange] = useState<"all" | "scene">("all");
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>(QUALITIES[0]);

  const rendering = renderState === "rendering";
  const seconds = range === "all" ? total(scenes) : scenes[sceneIdx]?.dur ?? 0;
  const frames = seconds * 24;
  const resolution = RESOLUTIONS.find((option) => option.value === exportRes) ?? RESOLUTIONS[0];
  const staleScenes = Object.values(staleByScene).filter((kinds) => kinds.length > 0).length;
  const filename = `${source.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "decode-project"}.${extension(exportFmt)}`;
  const estimatedMegabytes = useMemo(() => {
    const formatFactor = exportFmt === "ProRes" ? 4.8 : exportFmt === "WebM" ? 0.7 : 1;
    const qualityFactor = quality === "Draft" ? 0.42 : quality === "Balanced" ? 0.72 : 1;
    return Math.max(1, Math.round((seconds / 60) * 38 * resolution.factor * formatFactor * qualityFactor));
  }, [exportFmt, quality, resolution.factor, seconds]);

  useEffect(() => {
    if (!rendering) return;
    const id = window.setInterval(() => {
      const current = useStudio.getState().renderPct;
      const next = Math.min(100, current + 4);
      setRender(next === 100 ? "done" : "rendering", next);
    }, 220);
    return () => window.clearInterval(id);
  }, [rendering, setRender]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !rendering) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, rendering]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/72 p-6 backdrop-blur-[3px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !rendering) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="export-title" className="rail-y max-h-[88dvh] w-full max-w-[760px] overflow-y-auto rounded-[16px] border border-[var(--nle-line)] bg-[var(--nle-panel)] text-[var(--nle-text)] shadow-[0_32px_100px_rgb(0_0_0_/_0.55)]">
        <header className="flex items-center gap-4 px-7 pt-6 pb-5">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] tracking-[0.14em] text-[var(--nle-faint)] uppercase">Final output</div>
            <h2 id="export-title" className="mt-1 font-display text-[26px] font-semibold">Export video</h2>
          </div>
          <button type="button" onClick={onClose} disabled={rendering} aria-label="Close export settings" className="nle-icon-button h-9 w-9 rounded-[9px] disabled:opacity-35">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="grid gap-4 px-7 pb-6 sm:grid-cols-2">
          <SelectField label="Format" value={exportFmt} onChange={setExportFmt} disabled={rendering} options={FORMATS.map((value) => ({ value, label: value }))} />
          <SelectField label="Resolution" value={exportRes} onChange={setExportRes} disabled={rendering} options={RESOLUTIONS.map(({ value, label }) => ({ value, label }))} />
          <SelectField label="Frame range" value={range} onChange={(value) => setRange(value as "all" | "scene")} disabled={rendering} options={[{ value: "all", label: "Full video" }, { value: "scene", label: `Selected scene · ${String(sceneIdx + 1).padStart(2, "0")}` }]} />
          <SelectField label="Quality" value={quality} onChange={(value) => setQuality(value as (typeof QUALITIES)[number])} disabled={rendering} options={QUALITIES.map((value) => ({ value, label: value }))} />
        </div>

        <div className="mx-7 grid gap-2 rounded-[12px] bg-[var(--nle-panel-raised)] p-3 sm:grid-cols-2">
          <ToggleRow label="Burned-in captions" detail="Always visible" on={captions} onChange={toggleCaptions} disabled={rendering} />
          <ToggleRow label="Chapter markers" detail="Where supported" on={chapters} onChange={toggleChapters} disabled={rendering} />
        </div>

        <div className="mx-7 mt-5 grid grid-cols-2 gap-x-5 gap-y-4 rounded-[12px] border border-[var(--nle-grid-line)] bg-[#0D0D0D] p-4 sm:grid-cols-3">
          <Summary icon={MonitorPlay} label="Resolution" value={resolution.dimensions} />
          <Summary icon={FilmStrip} label="Frames" value={frames.toLocaleString()} />
          <Summary icon={Clock} label="Duration" value={fmt(seconds)} />
          <Summary icon={File} label="Est. size" value={`≈ ${estimatedMegabytes} MB`} />
          <Summary icon={Check} label="Quality" value={quality.split(" — ")[0]} />
          <Summary icon={FilmStrip} label="Scenes" value={range === "all" ? String(scenes.length) : "1"} />
        </div>

        {renderState !== "idle" && (
          <div className="mx-7 mt-5 rounded-[12px] bg-[var(--nle-panel-raised)] p-4" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-medium">{renderState === "done" ? "Export ready" : renderStepLabel(renderPct, captions || chapters)}</span>
              <span className="font-mono text-[10px] text-[var(--nle-muted)]">{renderPct}%</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#090909]">
              <div className="h-full origin-left bg-[var(--accent)] transition-transform duration-[var(--t-fast)]" style={{ transform: `scaleX(${renderPct / 100})` }} />
            </div>
            <div className="mt-3 grid gap-1.5 font-mono text-[9px] tracking-[0.05em] text-[var(--nle-faint)] uppercase sm:grid-cols-2">
              <ProgressLine done={renderPct >= 20} label="Compose scenes" />
              <ProgressLine done={renderPct >= 45} label="Mix narration" />
              <ProgressLine done={renderPct >= 75} label="Add delivery features" />
              <ProgressLine done={renderPct >= 100} label="Finalize file" />
            </div>
          </div>
        )}

        <footer className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--nle-grid-line)] px-7 py-5">
          <div className="min-w-0 truncate font-mono text-[9.5px] text-[var(--nle-faint)]">{filename}</div>
          <div className="flex flex-none gap-2">
            <button type="button" onClick={onClose} disabled={rendering} className="h-9 rounded-[9px] px-3 text-[12.5px] text-[var(--nle-muted)] hover:bg-[var(--nle-panel-raised)] hover:text-[var(--nle-text)] disabled:opacity-40">Cancel</button>
            {renderState === "done" ? (
              <button type="button" className="flex h-9 items-center gap-2 rounded-[9px] bg-[#F2F2F2] px-3 text-[12.5px] font-semibold text-[#141414] hover:bg-white">
                <DownloadSimple size={15} weight="bold" aria-hidden />
                Download
              </button>
            ) : (
              <button type="button" onClick={() => setRender("rendering", 0)} disabled={rendering || staleScenes > 0} className="h-9 rounded-[9px] bg-[#F2F2F2] px-3 text-[12.5px] font-semibold text-[#141414] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
                {staleScenes > 0 ? `Resolve ${staleScenes} stale scene${staleScenes === 1 ? "" : "s"}` : rendering ? "Rendering" : "Export"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <span className="mb-1.5 block font-mono text-[9px] tracking-[0.12em] text-[var(--nle-faint)] uppercase">{label}</span>
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? `${label.replace(/\s+/g, "-").toLowerCase()}-options` : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="nle-field flex h-11 w-full items-center justify-between gap-3 rounded-[9px] bg-[#0D0D0D] px-3 text-left text-[12.5px] disabled:opacity-45"
      >
        <span className="truncate">{selected.label}</span>
        <CaretDown size={14} className={`flex-none text-[var(--nle-faint)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div id={`${label.replace(/\s+/g, "-").toLowerCase()}-options`} role="listbox" aria-label={`${label} options`} className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[10px] border border-[var(--nle-line)] bg-[#171717] p-1.5 shadow-[0_18px_48px_rgb(0_0_0_/_0.5)]">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex min-h-10 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[12px] transition-colors ${active ? "bg-white/[0.055] text-[var(--nle-text)]" : "text-[var(--nle-muted)] hover:bg-white/[0.035] hover:text-[var(--nle-text)]"}`}
              >
                <span className={`grid h-4 w-4 flex-none place-items-center rounded-full border ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--nle-line-strong)]"}`}>
                  {active && <Check size={9} weight="bold" aria-hidden />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, detail, on, onChange, disabled }: { label: string; detail: string; on: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled} aria-pressed={on} className="flex min-h-12 items-center gap-3 rounded-[9px] px-2 text-left hover:bg-white/[0.03] disabled:opacity-45">
      <span className={`relative h-5 w-9 flex-none rounded-full transition-colors ${on ? "bg-[var(--accent)]" : "bg-[var(--nle-line-strong)]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} /></span>
      <span className="min-w-0"><span className="block text-[11.5px] font-medium">{label}</span><span className="block text-[9.5px] text-[var(--nle-faint)]">{detail}</span></span>
    </button>
  );
}

function Summary({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; weight?: "regular" | "bold" }>; label: string; value: string }) {
  return <div className="flex min-w-0 gap-2.5"><Icon size={15} weight="regular" /><div className="min-w-0"><div className="text-[9.5px] text-[var(--nle-faint)]">{label}</div><div className="truncate text-[12px] text-[var(--nle-text)]">{value}</div></div></div>;
}

function ProgressLine({ done, label }: { done: boolean; label: string }) {
  return <span className={done ? "text-[var(--nle-muted)]" : undefined}>{done ? "✓" : "·"} {label}</span>;
}

function extension(format: string) {
  if (format === "WebM") return "webm";
  if (format === "ProRes") return "mov";
  return "mp4";
}

function renderStepLabel(pct: number, extras: boolean) {
  if (pct < 25) return "Compositing scenes and visuals";
  if (pct < 50) return "Mixing narration audio";
  if (pct < 80) return extras ? "Adding captions and chapter markers" : "Encoding video frames";
  return "Finalizing the file";
}
