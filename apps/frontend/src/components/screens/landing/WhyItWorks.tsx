"use client";

import { useMemo } from "react";
import { SEED_SCENES } from "@/lib/api";
import { SceneVisual } from "@/components/project/canvas/SceneVisual";
import { StageKicker } from "@/components/ui/primitives";

/**
 * Why it works — built like creative software, not like a chatbot.
 *
 * The bento carries exactly one dark card, and that card *demonstrates* the
 * claim instead of stating it: a real scene renderer, at a held frame, with the
 * rest of the cut greyed beside it. "One scene, not the whole video" is much
 * more convincing shown than written.
 *
 * Deliberately not three equal cards in a row. The grid is asymmetric because
 * the claims are not equally important.
 */
export function WhyItWorks() {
  const scenes = useMemo(() => SEED_SCENES(), []);
  // Deliberately NOT scene 4. The hero diptych owns Multi-Head Attention
  // because its provenance claim is tied to §3.2.2; if this card repeats it,
  // three sections making three different arguments all show one picture and
  // the page looks like it only has one scene in it.
  const hero = scenes[2]; // Scaled Dot-Product — equation build, a distinct look

  return (
    <section
      id="why-decode"
      data-scene="Why Decode"
      className="scroll-mt-24 pt-[clamp(88px,10vw,136px)]"
    >
      <div className="mb-[clamp(32px,4vw,52px)] max-w-[620px]">
        <StageKicker className="mb-4">why it works</StageKicker>
        <h2
          data-reveal
          className="balance m-0 font-serif text-[clamp(32px,4.2vw,56px)] leading-[1.02] font-normal tracking-[-0.018em]"
        >
          Built like creative software.
          <span className="text-t8"> Not like a chatbot.</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* ---------- the dark card: the claim, demonstrated ---------- */}
        <div
          data-reveal
          className="scene-surface flex flex-col overflow-hidden rounded-[24px] shadow-[var(--shadow-dark-panel)]"
        >
          <div className="flex items-baseline justify-between gap-4 px-6 pt-6 sm:px-7">
            <h3 className="m-0 font-display text-[clamp(17px,1.8vw,21px)] font-medium text-canvas-cap">
              You can see why, every time
            </h3>
            <span className="flex-none font-mono text-[10px] tracking-[0.14em] text-canvas-meta uppercase">
              v2 · from scene script
            </span>
          </div>

          <p className="m-0 px-6 pt-2.5 pb-4 text-[13.5px] leading-[1.6] text-canvas-meta sm:px-7">
            Every draft keeps its history, source references, quality checks,
            and compute receipt. You can always see what changed and why.
          </p>

          {/* The real renderer, held at a legible frame. */}
          <div className="px-3 pb-1">
            <SceneVisual scene={hero} p={0.72} />
          </div>

          <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] px-6 py-5 sm:grid-cols-4 sm:px-7">
            {[
              ["Made by", "Motion Designer"],
              ["Based on", "Scene script · draft 2"],
              ["Quality check", "Ready"],
              ["Compute", "6.2 seconds"],
            ].map(([label, value]) => (
              <span key={label}>
                <span className="block font-mono text-[8.5px] tracking-[0.12em] text-canvas-meta uppercase">{label}</span>
                <span className="mt-1 block truncate text-[10.5px] text-canvas-chip-fg">{value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ---------- the light column ---------- */}
        <div className="grid grid-cols-1 gap-4">
          <Claim
            title="It stays on your source"
            body="It works from your document, not from a chat history. So it explains what your paper says, not what it half-remembers."
          >
            <div className="rounded-[14px] border border-line-input bg-sunken p-4">
              <div className="mb-3 font-mono text-[9px] tracking-[0.14em] text-t6 uppercase">
                Who hands to whom
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-t5">
                <span className="text-ink-2">Teaching Plan</span>
                <span>→</span>
                <span className="text-accent-deep">Scene script</span>
                <span>→</span>
                <span className="text-t5">Scene visuals</span>
              </div>
            </div>
          </Claim>

          <Claim
            title="You never see a first draft"
            body="Each step is checked and revised before you ever look at it. What reaches you has already been through review."
          >
            <div className="flex items-center gap-3 rounded-[14px] border border-line-input bg-sunken px-4 py-3">
              <span className="font-serif text-[28px] leading-none text-accent-deep">92</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium">Approved after 2 revisions</span>
                <span className="mt-0.5 block font-mono text-[8.5px] tracking-[0.1em] text-t6 uppercase">Pacing · terminology · continuity</span>
              </span>
            </div>
          </Claim>
        </div>
      </div>
    </section>
  );
}

function Claim({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div data-reveal className="studio-shell">
      <div className="studio-surface flex h-full flex-col gap-3 p-6 sm:p-7">
        <h3 className="m-0 font-display text-[17px] font-medium tracking-[-0.01em]">
          {title}
        </h3>
        <p className="pretty m-0 max-w-[46ch] text-[13.5px] leading-[1.65] text-ink-2">
          {body}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}
