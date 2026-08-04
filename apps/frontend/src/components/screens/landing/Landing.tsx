"use client";

import { useRef } from "react";
import { useStudio } from "@/store/studio";
import {
  Accent,
  AppMark,
  ChipCTA,
  Graphite,
} from "@/components/ui/primitives";
import { HowItWorks } from "./HowItWorks";
import { SourceStrip } from "./SourceStrip";
import { SourceToScene } from "./SourceToScene";
import { StudioDemo } from "./StudioDemo";
import { WhyItWorks } from "./WhyItWorks";
import { useLandingMotion } from "./motion";

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const go = useStudio((s) => s.go);
  const toStudio = () => go("dashboard");

  useLandingMotion(root);

  return (
    <div
      ref={root}
      id="top"
      className="min-h-dvh overflow-x-clip bg-[linear-gradient(180deg,#F3F3F1,#EBEBE9)]"
    >
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-50 -translate-y-20 rounded-[10px] bg-ink px-4 py-2 text-[13px] font-medium text-white transition-transform duration-150 ease-decode focus:translate-y-0"
      >
        Skip to content
      </a>

      {/* The pill floats, so the viewport's top edge is open. Without this the
          page is hard-cut at y=0 on either side of the bar. */}
      <div
        aria-hidden
        className="top-scrim pointer-events-none fixed inset-x-0 top-0 z-30 h-[72px] sm:h-[80px]"
      />

      {/* ================= nav ================= */}
      <nav className="sticky top-3 z-40 px-6 sm:top-4 sm:px-10">
        <div className="header-glass mx-auto max-w-[1100px] rounded-full border border-white/70 shadow-[var(--shadow-nav)]">
          <div className="flex items-center justify-between gap-4 py-2.5 pr-2.5 pl-5 sm:py-3 sm:pr-3 sm:pl-6">
            <a href="#top" className="flex items-center gap-2.5" aria-label="Decode home">
              <AppMark />
              <span className="font-display text-[16px] font-semibold tracking-[-0.01em]">
                Decode
              </span>
            </a>
            <div className="hidden items-center gap-8 text-[13.5px] text-ink md:flex">
              {[
                ["Product", "#decode-demo"],
                ["How it works", "#how-it-works"],
                ["Why Decode", "#why-decode"],
                              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="-my-3 py-3 transition-colors hover:text-accent"
                >
                  {label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <Graphite
                onClick={toStudio}
                className="px-[18px] py-2 text-[13.5px] font-medium"
              >
                Open Studio
              </Graphite>
            </div>
          </div>
        </div>
      </nav>

      <main id="main-content" className="mx-auto max-w-[1180px] px-6 sm:px-10">
        {/* ================= hero ================= */}
        <header
          data-scene="Understand anything"
          className="pb-[clamp(56px,7vw,96px)] pt-[clamp(40px,6vw,88px)]"
        >
          {/* Asymmetric, but the headline keeps the full measure. Splitting it
              into a column narrow enough to sit beside the copy forced it to
              four ragged lines and broke "Understand anything." mid-phrase.
              So the type stays wide and left; the answer to it sits right,
              which is what removes the centred-hero default. */}
          <div className="mb-[clamp(44px,6vw,80px)]">
            {/* Line breaks are authored, not left to the browser — the scale
                is capped where the longest line still fits the measure. */}
            <h1 className="m-0 font-serif leading-[0.94] font-normal tracking-[-0.02em] [font-size:clamp(44px,7.6vw,96px)]">
              <span className="block">
                {"Understand anything.".split(" ").map((w, i, all) => (
                  <span key={w} data-hero-word className="inline-block">
                    {w}
                    {i < all.length - 1 ? "\u00A0" : null}
                  </span>
                ))}
              </span>
              <span className="block text-t6">
                {"Not summarised —".split(" ").map((w) => (
                  <span key={w} data-hero-word className="inline-block">
                    {w}
                    {"\u00A0"}
                  </span>
                ))}
                <span
                  data-hero-word
                  className="inline-block font-hand text-accent [font-size:1.22em] tracking-normal"
                >
                  taught.
                </span>
              </span>
            </h1>

            {/* One left axis. The copy used to sit in the right half of a
                two-column grid, which indented it 573px to align with nothing
                — its only alignment was flush-right to the container, under a
                flush-left headline — and left a dead rectangle beneath the
                second line. The asymmetry belongs in the *measure*: the
                headline runs the full 1100px, the copy stops at 52ch. */}
            <div className="mt-[clamp(28px,3vw,44px)]">
              <div>
                <p
                  data-hero-sub
                  className="pretty m-0 max-w-[52ch] text-[clamp(15px,1.35vw,18px)] leading-[1.6] font-medium text-ink-2"
                >
                  Hand it any technical source. Get back a video that explains
                  it.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <div data-hero-act>
                    <ChipCTA onClick={toStudio}>
                      Start decoding — it&rsquo;s free
                    </ChipCTA>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <SourceToScene />
          </div>

          <SourceStrip />
        </header>

        {/* ================= the flow, performed ================= */}
        <HowItWorks />

        {/* ================= the studio ================= */}
        <StudioDemo />

        {/* ================= why it works ================= */}
        <WhyItWorks />

        {/* ================= proof ================= */}
        <section data-scene="Proof" className="pt-[clamp(88px,12vw,160px)]">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 gap-y-12 border-y border-line-input py-[clamp(40px,5vw,64px)]">
            {(
              [
                [11, " pages", "the paper that went in"],
                [5, " minutes", "the video that came out"],
                [8, " scenes", "each one you can redo on its own"],
              ] as const
            ).map(([n, unit, label]) => (
              // Each stat centres inside its own column, and the caption's
              // measure is centred with it — left-aligning the caption under a
              // centred numeral is what made the row look off-axis.
              <div key={label} className="flex flex-col items-center text-center">
                <div className="font-serif text-[clamp(44px,5.4vw,68px)] leading-none font-normal tracking-[-0.02em]">
                  <span data-stat={n}>{n}</span>
                  <span className="text-[0.45em] text-t6">{unit}</span>
                </div>
                <div className="mt-3 max-w-[24ch] text-[13.5px] leading-[1.5] text-ink-2">
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="mx-auto max-w-[760px] pt-[clamp(56px,7vw,96px)] text-center">
            <p
              data-reveal
              className="balance m-0 font-serif text-[clamp(24px,3vw,40px)] leading-[1.18] font-normal tracking-[-0.015em]"
            >
              For the people who have to
              <span className="text-accent"> actually understand it.</span>
            </p>
            <p
              data-reveal
              className="pretty m-0 mx-auto mt-6 max-w-[52ch] text-[15px] leading-[1.65] text-ink-2"
            >
              Students with a reading list they cannot get through. Engineers
              catching up on a paper everyone already cites. Researchers outside
              their field. And the teachers who have to explain all of it to a
              room.
            </p>
          </div>
        </section>

        {/* ================= CTA ================= */}
        <section
          data-cta
          className="relative mt-[clamp(88px,12vw,160px)] overflow-hidden rounded-[32px] bg-canvas px-8 py-[clamp(64px,9vw,104px)] text-center shadow-[var(--shadow-dark-panel)]"
        >
          <div
            data-cta-glow
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(640px 260px at 50% -60px, var(--accent-glow), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="relative">
            <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.2em] text-accent-lit">
              Ready when you are
            </div>
            <div className="balance mx-auto mb-5 max-w-[16ch] font-serif text-[clamp(34px,5vw,64px)] font-normal leading-[1.0] tracking-[-0.018em] text-[#F5F5F3]">
              Bring the source. Leave with a film.
            </div>
            <div className="mb-9 text-[15px] text-canvas-meta">
              Any technical source, any audience. Free while in beta.
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Accent
                onClick={toStudio}
                className="px-8 py-[14px] text-[15px] font-medium"
              >
                Start decoding
              </Accent>
            </div>
          </div>
        </section>

        {/* ================= footer ================= */}
        <footer className="pt-[clamp(64px,8vw,96px)]">
          <div className="flex flex-wrap justify-between gap-12 pb-14">
            <div className="max-w-[280px]">
              <div className="mb-3 flex items-center gap-[9px]">
                <AppMark size={20} font={12} />
                <span className="font-display text-[15px] font-semibold">
                  Decode
                </span>
              </div>
              <div className="text-[13px] leading-[1.6] text-ink-2">
                Decode any technical content into stories people understand.
              </div>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-ink-2">
              <a href="#how-it-works" className="-my-3 py-3 transition-colors hover:text-accent">How it works</a>
              <a href="#decode-demo" className="-my-3 py-3 transition-colors hover:text-accent">One-scene edit</a>
              <a href="#why-decode" className="-my-3 py-3 transition-colors hover:text-accent">Why Decode</a>
                            <button type="button" onClick={toStudio} className="text-ink-2 transition-colors hover:text-accent">Open Studio</button>
            </nav>
          </div>
          <div
            data-wordmark
            className="select-none text-center font-serif font-normal leading-[1.0] tracking-[-0.03em] text-[#E2E2DD]"
            style={{ fontSize: "clamp(64px,15.5vw,180px)" }}
            aria-hidden
          >
            decode
          </div>
          <div className="flex flex-wrap justify-between gap-4 border-t border-line-input pb-8 pt-5 text-[12.5px] text-t10">
            <div>© 2026 Decode. The AI produces, you direct.</div>
            <div>Private beta · product terms published before launch</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
