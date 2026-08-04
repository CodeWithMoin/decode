"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, FileText, Plus, Type, X } from "lucide-react";
import {
  AUDIENCE_HINTS,
  AUDIENCE_LEVELS,
  DEPTH_OPTIONS,
  EXAMPLES,
  RECENT_FILES,
  RUNTIME_OPTIONS,
  TONE_OPTIONS,
} from "@/lib/api";
import { useStudio } from "@/store/studio";
import { Select, StageKicker, cx } from "@/components/ui/primitives";
import { AppShell } from "@/components/app/AppShell";
import { decodeApi, idempotencyKey } from "@/lib/decode-api";
import { creatorError } from "@/lib/creator-errors";
import type { ProductionIntentPayload } from "@/lib/types";

interface CreationAttempt {
  fingerprint: string;
  projectKey: string;
  sourceKeys: string[];
  intentKey: string;
  generationKey: string;
  projectId?: string;
  sourceVersionIds: Array<string | undefined>;
  intentVersionId?: string;
}

const ACCEPT = ".pdf,.md,.markdown,.txt,.docx,.pptx,.tex,.epub";

/**
 * New Decode — project creation.
 *
 * Rebuilt to ask for the minimum and infer the maximum. Everything the Intake
 * agent can work out for itself — title, page count, reading time, complexity,
 * language, section count, content type — is *not* asked for. What remains is
 * the five things that genuinely change the output, plus an optional brand kit.
 *
 * Three deliberate departures from the previous version:
 *
 * 1. **Segmented rows, not dropdowns.** Four selects cost eight interactions
 *    (open, choose, ×4) and hide their own options until clicked. Four rows of
 *    chips cost four taps and teach the whole system at a glance. That is the
 *    entire friction budget of this screen.
 * 2. **Many sources, not one.** A lesson is often a paper *and* your notes.
 *    Forcing a single file meant merging PDFs by hand to say something simple.
 * 3. **No wizard.** Everything is on one surface, nothing is behind a step, and
 *    the only thing that is collapsed is the brand kit — which is genuinely
 *    optional and would otherwise be the biggest block on the screen.
 *
 * Audience stays free text with presets on top. "Second-year CS undergrads"
 * tells the Director far more than "Intermediate", and the Understanding stage
 * is already built to render an arbitrary string. The presets are one tap for
 * the common case; the field is there for the specific one.
 */
export function NewDecode({ connected = false }: { connected?: boolean }) {
  const router = useRouter();
  const sources = useStudio((s) => s.sources);
  const brief = useStudio((s) => s.brief);
  const audience = useStudio((s) => s.audience);
  const runtime = useStudio((s) => s.runtime);
  const depth = useStudio((s) => s.depth);
  const tone = useStudio((s) => s.tone);
  const brandKit = useStudio((s) => s.brandKit);
  const attach = useStudio((s) => s.attach);
  const detach = useStudio((s) => s.detach);
  const setBrandKit = useStudio((s) => s.setBrandKit);
  const setBrief = useStudio((s) => s.setBrief);
  const setAudience = useStudio((s) => s.setAudience);
  const setRuntime = useStudio((s) => s.setRuntime);
  const setDepth = useStudio((s) => s.setDepth);
  const setTone = useStudio((s) => s.setTone);
  const startDecode = useStudio((s) => s.startDecode);
  const go = useStudio((s) => s.go);

  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [kitOpen, setKitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitError, setSubmitError] = useState("");
  const attemptRef = useRef<CreationAttempt | null>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const ext = (file.name.split(".").pop() || "FILE").toUpperCase();
      attach({
        ext,
        file: file.name,
        title: file.name.replace(/\.[^/.]+$/, ""),
        author: "uploaded",
        meta: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        pages: "—",
        words: "—",
        kind: ext === "PDF" ? "paper" : "docs",
        upload: file,
      });
    }
  };

  const addPasted = () => {
    const text = pasted.trim();
    if (!text) return;
    const words = text.split(/\s+/).length;
    const name = `pasted-notes-${sources.length + 1}.txt`;
    attach({
      ext: "TXT",
      file: name,
      title: text.slice(0, 42).replace(/\s+\S*$/, "") || "Pasted notes",
      author: "pasted",
      meta: `${words.toLocaleString()} words`,
      pages: "—",
      words: `${words.toLocaleString()} words`,
      kind: "article",
      upload: new File([text], name, { type: "text/plain;charset=utf-8" }),
    });
    setPasted("");
    setPasting(false);
  };

  const ready =
    sources.length > 0 &&
    audience.trim().length > 0 &&
    (!connected || sources.every((source) => source.upload instanceof File));

  const createConnectedProject = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const fingerprint = JSON.stringify({
        sources: sources.map((source) => ({
          name: source.upload?.name,
          size: source.upload?.size,
          type: source.upload?.type,
          lastModified: source.upload?.lastModified,
        })),
        brief,
        audience,
        runtime,
        depth,
        tone,
        brandKit,
      });
      if (attemptRef.current?.fingerprint !== fingerprint) {
        attemptRef.current = {
          fingerprint,
          projectKey: idempotencyKey(),
          sourceKeys: sources.map(() => idempotencyKey()),
          intentKey: idempotencyKey(),
          generationKey: idempotencyKey(),
          sourceVersionIds: sources.map(() => undefined),
        };
      }
      const attempt = attemptRef.current;
      if (!attempt.projectId) {
        setSubmitStatus("Creating your project…");
        const project = await decodeApi.createProject(
          sources[0]?.title || undefined,
          attempt.projectKey,
        );
        attempt.projectId = project.project_id;
      }
      for (const [index, source] of sources.entries()) {
        if (attempt.sourceVersionIds[index]) continue;
        if (!source.upload) throw new Error("source_unavailable");
        setSubmitStatus(`Adding source ${index + 1} of ${sources.length}…`);
        const uploaded = await decodeApi.uploadSource(
          attempt.projectId,
          source.upload,
          source.kind === "article" ? "text" : "document",
          attempt.sourceKeys[index],
        );
        attempt.sourceVersionIds[index] = uploaded.source_version_id;
      }

      if (!attempt.intentVersionId) {
        setSubmitStatus("Saving your direction…");
        const intent = await decodeApi.publishIntent(
          attempt.projectId,
          toProductionIntent({ brief, audience, runtime, depth, tone, brandKit }),
          attempt.intentKey,
        );
        attempt.intentVersionId = intent.version_id;
      }
      setSubmitStatus("Starting the Producer…");
      const job = await decodeApi.generateBrief(
        attempt.projectId,
        attempt.sourceVersionIds.filter((id): id is string => Boolean(id)),
        attempt.intentVersionId,
        attempt.generationKey,
      );
      const projectId = attempt.projectId;
      attemptRef.current = null;
      router.push(`/studio/projects/${projectId}/jobs/${job.job_id}`);
    } catch (error) {
      setSubmitError(creatorError(error, "We couldn’t create your project. Please try again."));
      setSubmitStatus("");
      setSubmitting(false);
    }
  };

  return (
    <AppShell active="none" connected={connected}>
      <div className="flex min-h-dvh flex-col bg-[linear-gradient(180deg,#F3F3F1,#EBEBE9)]">
        <div className="flex items-center justify-between px-6 py-5 sm:px-8 lg:hidden">
          <button
            type="button"
            onClick={() => connected ? router.push("/studio") : go("dashboard")}
            className="rounded-full border border-line-soft bg-card px-4 py-2 text-[13px] font-medium text-t6 transition-colors hover:border-line-strong hover:text-ink"
          >
            ← Studio
          </button>
          <div className="text-[13px] font-medium text-t7">New decode</div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-7 px-4 pt-7 pb-24 lg:pt-12">
          <div className="flex w-full max-w-[720px] flex-col items-start gap-3 text-left">
            <StageKicker>New production</StageKicker>
            <h1 className="m-0 text-balance font-display text-[clamp(28px,3.4vw,38px)] font-semibold leading-[1.06] tracking-[-0.03em]">
              What should the crew teach next?
            </h1>
            <p className="m-0 max-w-[58ch] text-[13.5px] leading-[1.65] text-t6">
              Add your sources and tell Decode what you want to teach. You’ll
              review each part before production continues.
            </p>
          </div>

          <div className="w-full max-w-[720px] overflow-hidden rounded-[22px] border border-white/80 bg-card shadow-xl">
            {/* ------------------------- 1 · sources ------------------------- */}
            <div className="p-4 sm:p-5">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {sources.length > 0 && (
                <ul className="m-0 mb-2.5 flex list-none flex-col gap-1.5 p-0">
                  {sources.map((s) => (
                    <li
                      key={s.file}
                      className="flex items-center gap-2.5 rounded-[12px] border border-line-input bg-sunken px-3 py-2"
                    >
                      <span className="flex-none rounded-[5px] bg-white px-1.5 py-0.5 font-mono text-[9px] font-medium text-t6 uppercase">
                        {s.ext}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {s.title}
                      </span>
                      <span className="flex-none font-mono text-[10px] text-t9">
                        {s.meta}
                      </span>
                      <button
                        type="button"
                        onClick={() => detach(s.file)}
                        aria-label={`Remove ${s.title}`}
                        className="flex-none rounded-[6px] p-0.5 text-t8 transition-colors hover:text-ink"
                      >
                        <X size={13} strokeWidth={2} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {pasting ? (
                <div className="rounded-[16px] border border-line-input bg-sunken p-3">
                  <textarea
                    autoFocus
                    rows={5}
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder="Paste your notes, an article, or any text…"
                    className="w-full resize-none bg-transparent text-[13.5px] leading-[1.6] text-ink outline-none placeholder:text-t8"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPasting(false);
                        setPasted("");
                      }}
                      className="rounded-[9px] px-3 py-1.5 text-[12.5px] text-t6 transition-colors hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addPasted}
                      disabled={!pasted.trim()}
                      className={cx(
                        "rounded-[9px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                        pasted.trim()
                          ? "bg-ink text-white"
                          : "cursor-not-allowed bg-sunken-3 text-t9",
                      )}
                    >
                      Add text
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    addFiles(e.dataTransfer.files);
                  }}
                  className={cx(
                    "flex flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed px-4 py-7 text-center transition-colors duration-[var(--t-fast)]",
                    over
                      ? "border-[var(--accent)] bg-[var(--accent-tint)]"
                      : "border-line-mid bg-sunken",
                  )}
                >
                  <span className="text-[13.5px] font-medium text-ink-2">
                    {sources.length
                      ? "Add another source"
                      : "Drop a PDF, markdown or notes here"}
                  </span>
                  <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line-input bg-card px-2.5 py-1 text-[12.5px] font-medium transition-colors hover:border-line-strong"
                  >
                    <FileText size={12} strokeWidth={1.8} aria-hidden />
                    browse
                  </button>
                    <span className="text-[12.5px] text-t8">or</span>
                  <button
                    type="button"
                    onClick={() => setPasting(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line-input bg-card px-2.5 py-1 text-[12.5px] font-medium transition-colors hover:border-line-strong"
                  >
                    <Type size={12} strokeWidth={1.8} aria-hidden />
                    paste text
                  </button>
                  </span>
                </div>
              )}
            </div>

            {/* --------------------- 2 · creative brief --------------------- */}
            <div className="border-t border-sunken-3 px-4 pt-4 pb-4 sm:px-5">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <Label>Creative brief</Label>
                <span className="font-mono text-[9.5px] tracking-[0.1em] text-t9 uppercase">
                  optional
                </span>
              </div>
              {/* Bordered, because an unstyled textarea on a white card reads
                  as body copy — the placeholder looked like instructions
                  rather than something you could click into and type. */}
              <textarea
                rows={2}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Focus on intuition. Skip the proofs. Assume they know transformers."
                className="w-full resize-none rounded-[11px] border border-line-input bg-white px-3 py-2 text-[13.5px] leading-[1.6] text-ink outline-none transition-colors duration-[var(--t-fast)] placeholder:text-t8 hover:border-line-strong focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-tint)]"
              />
              <p className="m-0 mt-1.5 text-[11.5px] text-t9">
                Your files supply the knowledge. This supplies the intent.
              </p>
            </div>

            {/* --------------------- 3 · the four knobs --------------------- */}
            {/* Four labelled fields, not fifteen chips.
                An earlier version laid every option out flat so nothing was
                hidden behind a click — cheaper to operate, but it put fifteen
                competing pills on the busiest part of the screen and the eye
                had nowhere to rest. These are finite, familiar choices; a
                select is what they are. Audience stays an input because it is
                the one answer worth writing in your own words. */}
            <div className="grid gap-3 border-t border-sunken-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
              <Field label="Audience">
                <input
                  type="text"
                  list="audience-options"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Beginner, or describe them…"
                  className={FIELD}
                />
                <datalist id="audience-options">
                  {[...AUDIENCE_LEVELS, ...AUDIENCE_HINTS].map((h) => (
                    <option key={h} value={h} />
                  ))}
                </datalist>
              </Field>

              <Field label="Length">
                <Select
                  label="Length"
                  value={runtime}
                  onChange={setRuntime}
                  options={RUNTIME_OPTIONS}
                  className={FIELD}
                />
              </Field>

              <Field label="Depth">
                <Select
                  label="Depth"
                  value={depth}
                  onChange={setDepth}
                  options={DEPTH_OPTIONS}
                  className={FIELD}
                />
              </Field>

              <Field label="Narration style">
                <Select
                  label="Narration style"
                  value={tone}
                  onChange={setTone}
                  options={TONE_OPTIONS}
                  className={FIELD}
                />
              </Field>
            </div>

            {/* ----------------------- 4 · brand kit ----------------------- */}
            <div className="border-t border-sunken-3 px-4 sm:px-5">
              <button
                type="button"
                onClick={() => setKitOpen((v) => !v)}
                aria-expanded={kitOpen}
                className="flex w-full items-center gap-2 py-3 text-left text-[12.5px] text-t6 transition-colors hover:text-ink"
              >
                <ChevronDown
                  size={13}
                  strokeWidth={2}
                  aria-hidden
                  className={cx(
                    "transition-transform duration-[var(--t-fast)]",
                    kitOpen && "rotate-180",
                  )}
                />
                Brand kit
                <span className="text-t9">
                  {brandKit ? "· applied to every visual" : "· optional"}
                </span>
              </button>

              {kitOpen && (
                <div className="grid gap-2 pb-4 sm:grid-cols-2">
                  <KitField
                    label="Brand colours"
                    placeholder="#C2410C, #0E0E10"
                    value={brandKit?.colors.join(", ") ?? ""}
                    onChange={(v) =>
                      setBrandKit({
                        logo: brandKit?.logo ?? null,
                        fonts: brandKit?.fonts ?? null,
                        guidelines: brandKit?.guidelines ?? null,
                        colors: v
                          .split(",")
                          .map((c) => c.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <KitField
                    label="Typeface"
                    placeholder="Inter, Söhne…"
                    value={brandKit?.fonts ?? ""}
                    onChange={(v) =>
                      setBrandKit({
                        logo: brandKit?.logo ?? null,
                        colors: brandKit?.colors ?? [],
                        guidelines: brandKit?.guidelines ?? null,
                        fonts: v || null,
                      })
                    }
                  />
                  <div className="sm:col-span-2">
                    <KitField
                      label="Guidelines"
                      placeholder="Anything the visuals must respect"
                      value={brandKit?.guidelines ?? ""}
                      onChange={(v) =>
                        setBrandKit({
                          logo: brandKit?.logo ?? null,
                          colors: brandKit?.colors ?? [],
                          fonts: brandKit?.fonts ?? null,
                          guidelines: v || null,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* -------------------------- 5 · create -------------------------- */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sunken-3 bg-sunken px-4 py-3 sm:px-5">
              <span className="min-w-0 text-[11.5px] text-t7">
                {ready ? (
                  <>
                    {sources.length} source{sources.length > 1 ? "s" : ""} ·
                    Decode works out the rest
                  </>
                ) : (
                  "PDF · Markdown · Text · Docs · Papers"
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!ready) return;
                  if (connected) void createConnectedProject();
                  else startDecode();
                }}
                disabled={!ready || submitting}
                className={cx(
                  "flex flex-none items-center gap-2 py-1.5 pr-1.5 pl-4 text-[13px] font-medium",
                  ready && !submitting ? "glass-accent" : "glass-off",
                )}
              >
                {submitting ? submitStatus || "Creating project…" : "Create project"}
                <span
                  aria-hidden
                  className="grid h-[22px] w-[22px] place-items-center rounded-full"
                  style={{ background: "rgba(255,255,255,0.18)" }}
                >
                  <ArrowRight size={12} strokeWidth={2.2} />
                </span>
              </button>
            </div>
            {submitError && (
              <div role="alert" className="border-t border-[#E7C8BF] bg-[#FFF5F2] px-5 py-3 text-[12px] text-[#8E2F19]">
                {submitError} Your draft and selected files are still here.
              </div>
            )}
          </div>

          {/* ------------------------ quick starts ------------------------ */}
          {!connected && <div className="w-full max-w-[720px]">
            <Label>Start from something you have</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[...RECENT_FILES.map((f) => f.src), ...EXAMPLES.map((e) => e.src)]
                .filter(
                  (s, i, all) => all.findIndex((o) => o.file === s.file) === i,
                )
                .slice(0, 6)
                .map((src) => {
                  const on = sources.some((s) => s.file === src.file);
                  return (
                    <button
                      key={src.file}
                      type="button"
                      onClick={() => (on ? detach(src.file) : attach(src))}
                      className={cx(
                        "flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors duration-[var(--t-fast)]",
                        on
                          ? "border-[var(--accent-line)] bg-[var(--accent-tint)]"
                          : "border-line bg-card hover:border-line-strong",
                      )}
                    >
                      <span className="flex-none rounded-[5px] bg-sunken px-1.5 py-0.5 font-mono text-[9px] font-medium text-t6 uppercase">
                        {src.ext}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">
                          {src.title}
                        </span>
                        <span className="block truncate text-[11px] text-t7">
                          {src.meta}
                        </span>
                      </span>
                      <Plus
                        size={13}
                        strokeWidth={2}
                        aria-hidden
                        className={cx(
                          "flex-none transition-transform",
                          on ? "rotate-45 text-accent-deep" : "text-t9",
                        )}
                      />
                    </button>
                  );
                })}
            </div>
          </div>}
        </div>

      </div>
    </AppShell>
  );
}

function toProductionIntent({
  brief,
  audience,
  runtime,
  depth,
  tone,
  brandKit,
}: {
  brief: string;
  audience: string;
  runtime: string;
  depth: string;
  tone: string;
  brandKit: ReturnType<typeof useStudio.getState>["brandKit"];
}): ProductionIntentPayload {
  const seconds: Record<string, 60 | 180 | 300 | 600 | null> = {
    "1 min": 60,
    "3 min": 180,
    "5 min": 300,
    "10 min": 600,
    "Deep dive": null,
  };
  const depthValue: Record<string, ProductionIntentPayload["depth"]> = {
    "Intuition first": "intuition_first",
    Balanced: "balanced",
    Rigorous: "rigorous",
  };
  const toneValue: Record<string, ProductionIntentPayload["narration_style"]> = {
    Professional: "professional",
    Friendly: "friendly",
    Storyteller: "storyteller",
  };
  return {
    creative_brief: brief.trim() || null,
    audience: audience.trim(),
    target_duration_seconds: seconds[runtime] ?? 300,
    runtime_mode: runtime === "Deep dive" ? "deep_dive" : "fixed",
    depth: depthValue[depth] ?? "balanced",
    narration_style: toneValue[tone] ?? "professional",
    brand: {
      colors: brandKit?.colors ?? [],
      fonts: brandKit?.fonts ?? null,
      guidelines: brandKit?.guidelines ?? null,
    },
  };
}

/* ------------------------------------------------------------------ */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block font-mono text-[9.5px] tracking-[0.13em] text-t9 uppercase">
      {children}
    </span>
  );
}

const FIELD =
  "w-full min-w-0 rounded-[11px] border border-line-input bg-white px-3 py-2 text-[13px] text-ink outline-none transition-colors duration-[var(--t-fast)] placeholder:font-normal placeholder:text-t8 hover:border-line-strong focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-tint)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block font-mono text-[9.5px] tracking-[0.12em] text-t9 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function KitField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-t7">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-line-input bg-sunken px-2.5 py-1.5 text-[12.5px] outline-none transition-colors placeholder:text-t8 hover:border-line-strong focus:border-[var(--accent)]"
      />
    </label>
  );
}
