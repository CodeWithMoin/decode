"use client";

import { useEffect, useMemo } from "react";
import { Check, Download } from "lucide-react";
import { Accent, StageKicker, Toggle, cx } from "@/components/ui/primitives";
import { fmt, total } from "@/lib/derive";
import { useStudio } from "@/store/studio";

/**
 * Export is a small decision surface, so every meaningful choice stays
 * visible. Native selects hid the active combination and made comparison
 * needlessly serial; radio tiles make selection, explanation and keyboard
 * state legible at once.
 */

const RESOLUTIONS = [
  { value: "1080p", label: "1080p", detail: "Full HD" },
  { value: "1440p", label: "1440p", detail: "Sharper screens" },
  { value: "4K", label: "4K", detail: "Ultra HD" },
] as const;

const FORMATS = [
  { value: "MP4 · H.264", label: "MP4", detail: "Best for sharing" },
  { value: "WebM", label: "WebM", detail: "Smallest web file" },
  { value: "ProRes", label: "ProRes", detail: "Editing master" },
] as const;

function renderStepLabel(pct: number, extras: boolean): string {
  if (pct < 30) return "Compositing scenes and visuals";
  if (pct < 60) return "Mixing narration audio";
  if (pct < 90) return extras ? "Adding captions and chapter markers" : "Encoding video frames";
  return "Finalizing the file";
}

function fileExtension(format: string): string {
  if (format === "WebM") return "webm";
  if (format === "ProRes") return "mov";
  return "mp4";
}

function estimatedSize(resolution: string, format: string): string {
  const base = resolution === "4K" ? 712 : resolution === "1440p" ? 356 : 214;
  const multiplier = format === "ProRes" ? 4.8 : format === "WebM" ? 0.72 : 1;
  const megabytes = Math.round(base * multiplier);
  return megabytes >= 1000 ? `≈ ${(megabytes / 1000).toFixed(1)} GB` : `≈ ${megabytes} MB`;
}

export function Export() {
  const sc = useStudio((s) => s.sc);
  const source = useStudio((s) => s.source);
  const exportRes = useStudio((s) => s.exportRes);
  const exportFmt = useStudio((s) => s.exportFmt);
  const captions = useStudio((s) => s.captions);
  const chapters = useStudio((s) => s.chapters);
  const renderState = useStudio((s) => s.renderState);
  const renderPct = useStudio((s) => s.renderPct);
  const staleByScene = useStudio((s) => s.staleByScene);
  const setExportRes = useStudio((s) => s.setExportRes);
  const setExportFmt = useStudio((s) => s.setExportFmt);
  const toggleCaptions = useStudio((s) => s.toggleCaptions);
  const toggleChapters = useStudio((s) => s.toggleChapters);
  const setRender = useStudio((s) => s.setRender);

  const runtime = useMemo(() => fmt(total(sc)), [sc]);
  const staleScenes = Object.values(staleByScene).filter(
    (kinds) => kinds.length > 0,
  ).length;
  const rendering = renderState === "rendering";
  const filename = `${source.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "decode-project"}.${fileExtension(exportFmt)}`;
  const size = estimatedSize(exportRes, exportFmt);

  useEffect(() => {
    if (!rendering) return;
    const id = setInterval(() => {
      const cur = useStudio.getState().renderPct;
      const step = 1 + Math.floor(Math.random() * 9);
      const next = cur + step;
      setRender(next >= 100 ? "done" : "rendering", Math.min(next, 100));
    }, 220);
    return () => clearInterval(id);
  }, [rendering, setRender]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8">
      <header className="mb-7">
        <StageKicker>Final output</StageKicker>
        <h1 className="mt-1 text-balance font-display text-[26px] font-semibold tracking-[-0.015em] text-ink">
          Choose the file. Keep the project.
        </h1>
        <p className="mt-2 max-w-[58ch] text-[13.5px] leading-[1.65] text-t6">
          Rendering creates one delivery file from the current cut. Your project
          and all of its editable work stay exactly where they are.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <section className="rounded-[18px] border border-line bg-card p-5 shadow-sm" aria-labelledby="output-format-title">
            <div className="mb-5">
              <h2 id="output-format-title" className="font-display text-[16px] font-semibold text-ink">
                Output format
              </h2>
              <p className="mt-1 text-[11.5px] text-t7">
                Pick for where the video goes next. You can render another format later.
              </p>
            </div>

            <ChoiceGroup
              label="Resolution"
              value={exportRes}
              options={RESOLUTIONS}
              onChange={setExportRes}
              disabled={rendering}
            />

            <div className="my-5 h-px bg-line-inner" aria-hidden />

            <ChoiceGroup
              label="File type"
              value={exportFmt}
              options={FORMATS}
              onChange={setExportFmt}
              disabled={rendering}
            />
          </section>

          <fieldset
            disabled={rendering}
            className={cx(
              "rounded-[18px] border border-line bg-card px-5 shadow-sm transition-opacity",
              rendering && "opacity-55",
            )}
          >
            <legend className="sr-only">Included features</legend>
            <IncludeRow
              label="Burned-in captions"
              detail="Always visible in the exported video"
              on={captions}
              onChange={toggleCaptions}
            />
            <IncludeRow
              label="Chapter markers"
              detail="Adds navigation where the format supports it"
              on={chapters}
              onChange={toggleChapters}
            />
          </fieldset>
        </div>

        <aside className="overflow-hidden rounded-[18px] border border-line bg-card shadow-md" aria-label="Export summary">
          <div className="aspect-video bg-canvas p-4 text-white">
            <div className="flex h-full flex-col justify-between rounded-[11px] border border-white/10 bg-white/[0.025] p-3">
              <span className="font-mono text-[8.5px] tracking-[0.12em] text-canvas-meta uppercase">
                Final output
              </span>
              <div>
                <div className="line-clamp-2 font-display text-[16px] font-medium leading-[1.18] text-canvas-cap">
                  {source.title}
                </div>
                <div className="mt-1 font-mono text-[9px] text-canvas-meta">
                  {sc.length} scenes · {runtime}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px] font-medium text-ink">{filename}</div>
                <div className="mt-1 text-[11px] text-t7">{exportRes} · {exportFmt} · {size}</div>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line-inner pt-3 text-[11px]">
              <Summary label="Captions" value={captions ? "Included" : "Off"} />
              <Summary label="Chapters" value={chapters ? "Included" : "Off"} />
            </div>

            {renderState === "idle" && (
              <>
                <Accent
                  onClick={() => setRender("rendering", 0)}
                  disabled={staleScenes > 0}
                  className="w-full px-4 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {staleScenes > 0
                    ? `Resolve ${staleScenes} stale scene${staleScenes === 1 ? "" : "s"}`
                    : `Render ${fileExtension(exportFmt).toUpperCase()} · ${runtime}`}
                </Accent>
                {staleScenes > 0 && (
                  <p className="mt-2 text-[10.5px] leading-[1.5] text-[var(--color-stale-fg)]">
                    Rebuild the affected scenes before creating a new export.
                  </p>
                )}
              </>
            )}

            {renderState === "rendering" && (
              <div role="status" aria-live="polite">
                <div className="flex items-start justify-between gap-3 text-[11.5px]">
                  <span className="leading-[1.4] text-ink-2">
                    {renderStepLabel(renderPct, captions || chapters)}
                  </span>
                  <span className="flex-none font-mono text-t7 tabular-nums">{renderPct}%</span>
                </div>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-sunken-3">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-150 ease-decode"
                    style={{ width: `${renderPct}%` }}
                  />
                </div>
              </div>
            )}

            {renderState === "done" && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-ink">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-white" aria-hidden>
                    <Check size={11} strokeWidth={2.4} />
                  </span>
                  Export ready
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border border-line-input bg-card px-3.5 py-2.5 text-[12.5px] font-medium text-t6 transition-colors duration-[var(--t-fast)] hover:border-line-strong hover:text-ink"
                >
                  <Download size={14} strokeWidth={1.8} aria-hidden />
                  Download {fileExtension(exportFmt).toUpperCase()}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly { value: T; label: string; detail: string }[];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2.5 font-mono text-[9.5px] tracking-[0.11em] text-t7 uppercase">
        {label}
      </legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cx(
                "relative min-w-0 rounded-[12px] border px-3 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-[var(--t-fast)] active:translate-y-px",
                selected
                  ? "border-ink bg-ink text-white shadow-sm"
                  : "border-line-input bg-sunken text-ink hover:border-line-strong hover:bg-card",
              )}
            >
              <span className="block text-[12.5px] font-semibold">{option.label}</span>
              <span className={cx("mt-1 block truncate text-[9.5px]", selected ? "text-white/60" : "text-t7")}>
                {option.detail}
              </span>
              <span
                className={cx(
                  "absolute top-2.5 right-2.5 grid h-3.5 w-3.5 place-items-center rounded-full border transition-colors",
                  selected ? "border-white/35 bg-white text-ink" : "border-line-strong bg-card",
                )}
                aria-hidden
              >
                {selected && <Check size={8} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function IncludeRow({
  label,
  detail,
  on,
  onChange,
}: {
  label: string;
  detail: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line-inner py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-ink-2">{label}</div>
        <div className="mt-0.5 text-[10.5px] text-t7">{detail}</div>
      </div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[8px] tracking-[0.1em] text-t9 uppercase">{label}</div>
      <div className="mt-0.5 text-[11px] text-ink-2">{value}</div>
    </div>
  );
}
