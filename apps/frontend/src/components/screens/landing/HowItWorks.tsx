"use client";

import { ArrowDown, Clapperboard, FileUp, SlidersHorizontal } from "lucide-react";
import { Kicker } from "@/components/ui/primitives";

const STEPS = [
  {
    n: "01",
    title: "Upload",
    body: "Drop in a paper, a chapter, a set of docs, or your own notes.",
    note: "PDF · DOCX · URL · TEXT",
    icon: FileUp,
  },
  {
    n: "02",
    title: "Direct",
    body: "Decode plans the lesson, writes the narration, and builds every scene. You change anything that is wrong.",
    note: "EVERY STEP STAYS EDITABLE",
    icon: SlidersHorizontal,
  },
  {
    n: "03",
    title: "Export",
    body: "Watch it through, fix whatever you want, then make the video.",
    note: "MP4 · CAPTIONS INCLUDED",
    icon: Clapperboard,
  },
] as const;

/**
 * The visitor's workflow, deliberately separated from Decode's nine internal
 * stages. This is the simplest possible contract: the user does three things;
 * the crew handles the production between them.
 */
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      data-scene="Three decisions"
      className="scroll-mt-24 border-t border-line-input pt-[clamp(72px,8vw,112px)]"
    >
      <div className="grid grid-cols-1 gap-x-[clamp(40px,6vw,88px)] gap-y-10 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
        <div>
          <Kicker className="mb-3 block">
            your part
          </Kicker>
          <h2
            data-reveal
            className="balance m-0 max-w-[12ch] font-serif text-[clamp(34px,4.5vw,60px)] leading-[1.01] font-normal tracking-[-0.02em]"
          >
            Three decisions,
            <span className="text-t6"> and Decode does the rest.</span>
          </h2>
          <p
            data-reveal
            className="pretty m-0 mt-6 max-w-[42ch] text-[15px] leading-[1.7] text-ink-2"
          >
            You bring the source, change what you want, and approve the video. The
            Decode handles everything between.
          </p>
        </div>

        <ol className="m-0 -mx-4 list-none border-t border-line-input p-0 sm:-mx-5">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.n}
                data-reveal
                className="group grid grid-cols-[26px_minmax(0,1fr)_36px] items-center gap-x-3 gap-y-1 rounded-[10px] border-b border-line-input px-4 py-6 transition-colors duration-150 ease-decode hover:bg-card/55 sm:grid-cols-[32px_150px_minmax(0,1fr)_40px] sm:gap-x-4 sm:px-5"
              >
                <span className="font-mono text-[10.5px] text-t6 tabular-nums">
                  {step.n}
                </span>
                <span className="font-display text-[18px] font-semibold tracking-[-0.015em]">
                  {step.title}
                </span>
                <span className="col-start-2 row-start-2 max-w-[48ch] text-[13.5px] leading-[1.65] text-t6 sm:col-start-3 sm:row-start-1">
                  {step.body}
                  <span className="mt-2 block font-mono text-[9px] tracking-[0.12em] text-t6">
                    {step.note}
                  </span>
                </span>
                <span className="col-start-3 row-span-2 row-start-1 grid h-9 w-9 place-items-center rounded-[10px] border border-line-input bg-sunken text-t6 transition-[background-color,color,transform] duration-150 ease-decode group-hover:-translate-y-px group-hover:bg-card group-hover:text-accent-deep sm:col-start-4 sm:row-span-1">
                  {index === STEPS.length - 1 ? (
                    <Icon size={16} strokeWidth={1.6} aria-hidden />
                  ) : (
                    <ArrowDown size={15} strokeWidth={1.6} aria-hidden />
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
