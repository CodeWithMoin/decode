"use client";

import { CONCEPTS, PROJECT_DESCRIPTION } from "@/lib/api";
import { fmt, num } from "@/lib/derive";
import { useStudio } from "@/store/studio";
import { HandoffBrief, HandoffBar } from "@/components/crew/HandoffCard";
import { Micro, StageKicker, cx } from "@/components/ui/primitives";

const CONCEPTS_FOUND = 37;

/**
 * Understanding — the Producer's stage.
 *
 * Read-only: nothing here is edited, only reviewed. The Producer states what
 * it read (concepts, scenes) and the user either approves or pushes back.
 * Approving hands the artifact to the Director and advances the tab.
 */
export function Understanding() {
  const sc = useStudio((s) => s.sc);
  const source = useStudio((s) => s.source);
  const audience = useStudio((s) => s.audience);
  const depth = useStudio((s) => s.depth);
  const runtime = useStudio((s) => s.runtime);
  const approvals = useStudio((s) => s.approvals);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const select = useStudio((s) => s.select);
  const approve = useStudio((s) => s.approve);
  const setThreadOpen = useStudio((s) => s.setThreadOpen);

  const approved = approvals.understanding;

  // The Audience stat is user free text — never line-clamped, only sized
  // down at two length thresholds so long answers stay fully legible.
  const audienceFontSize =
    audience.length > 26 ? "13.5px" : audience.length > 16 ? "15px" : "18px";

  const handleApprove = () => {
    approve(
      "understanding",
      `Locked in the read — ${CONCEPTS_FOUND} concepts found, ${CONCEPTS.length} carrying the story. Handing the plan to the Director next.`,
      "Understanding approved",
      "plan",
    );
  };

  const handlePushBack = () => setThreadOpen(true);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col gap-6 p-6 pb-[var(--handoff-h)] lg:p-8 lg:pb-[var(--handoff-h)]">
      {/* ============================ header ============================ */}
      {/* No "First frame" panel. Nothing has been designed yet at Understanding
          — the Motion Designer has not run, so a frame here showed a visual the
          production had not made. It also rendered scene 1 at p=0, which is a
          near-empty canvas: the heaviest element on the screen carrying the
          least information. The read comes first; frames arrive in Edit. */}
      <div className="min-w-0">
        <StageKicker>understanding</StageKicker>
        <h1 className="mt-1 text-balance font-display text-[26px] font-semibold">
          {source.title}
        </h1>
        <p className="mt-2 max-w-[54ch] text-[14px] leading-[1.6] text-t6 pretty">
          {PROJECT_DESCRIPTION}
        </p>
      </div>

      {/* ============================ stat row =========================== */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))" }}
      >
        <Stat label="Concepts" value={`${CONCEPTS_FOUND}`} sub={`${CONCEPTS.length} in the video`} />
        <Stat
          label="Audience"
          value={audience}
          sub={depth}
          wrap
          valueStyle={{ fontSize: audienceFontSize }}
        />
        <Stat label="Target" value={runtime} sub="requested" />
        <Stat label="Source" value={source.pages} sub={source.words} />
      </div>

      {/* ============================ concepts ============================ */}
      <HandoffBrief
        crew="producer"
        message={`I read the source and pulled out ${CONCEPTS_FOUND} concepts — ${CONCEPTS.length} of them carry the story from here into the ${sc.length}-scene cut below.`}
        why={`The rest are supporting detail this audience won't need spelled out. Keeping the beat count tight keeps the ${runtime} target honest.`}
      />

      <section className="studio-surface p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[15px] font-semibold">
            Concepts extracted
          </h2>
          <span className="flex-none font-mono text-[11px] text-t7">
            {CONCEPTS_FOUND} found &middot; {CONCEPTS.length} in the video
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONCEPTS.map((concept) => (
            <span
              key={concept}
              className="whitespace-nowrap rounded-full border border-line-input bg-sunken px-3 py-1.5 text-[12.5px] text-ink-2"
            >
              {concept}
            </span>
          ))}
        </div>
      </section>

      {/* ============================ scene list =========================== */}
      <section className="studio-surface overflow-hidden shadow-sm">
        {sc.map((scene, i) => (
          <button
            key={scene.id}
            type="button"
            onClick={() => select(i)}
            aria-current={i === sceneIdx ? "true" : undefined}
            className={cx(
              "grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-0 px-4 py-3 text-left transition-colors duration-[var(--t-fast)]",
              i !== sc.length - 1 && "border-b border-line-div",
              i === sceneIdx ? "bg-[var(--accent-tint)]" : "bg-transparent hover:bg-sunken",
            )}
          >
            <span className={cx("row-span-2 font-mono text-[11px] tabular-nums", i === sceneIdx ? "text-accent-deep" : "text-t7")}>
              {num(i)}
            </span>
            <span className="min-w-0 truncate text-[13.5px] font-medium">
              {scene.title}
            </span>
            <span className="font-mono text-[11px] text-t6 tabular-nums">
              {fmt(scene.dur)}
            </span>
            <span className="min-w-0 truncate text-[12.5px] text-t6">{scene.caption}</span>
            <span className="hidden font-mono text-[10px] text-t7 sm:block">{scene.anim}</span>
          </button>
        ))}
      </section>

      {/* ============================ handoff ============================ */}
      <HandoffBar
        crew="producer"
        status={approved ? "Approved" : "Ready for your review"}
        approved={approved}
        handoff="Understanding approved — building the teaching plan next."
        nextLabel="Next: Teaching Plan"
        approveLabel="Approve and plan"
        onApprove={handleApprove}
        onPushBack={handlePushBack}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  sub,
  wrap = false,
  valueStyle,
}: {
  label: string;
  value: string;
  sub: string;
  /** Audience is user free text — it must wrap, never clamp or ellipsize. */
  wrap?: boolean;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="studio-surface-muted flex min-h-[96px] flex-col p-4">
      <Micro>{label}</Micro>
      <div
        className={cx(
          "mt-1.5 font-display font-semibold text-ink",
          wrap ? "break-words" : "truncate",
        )}
        style={{ fontSize: "18px", ...valueStyle }}
      >
        {value}
      </div>
      <div className="mt-auto pt-2 text-[12px] text-t6">{sub}</div>
    </div>
  );
}
