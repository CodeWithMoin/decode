"use client";

import { useState, type FormEvent } from "react";

/**
 * The waitlist landing. One idea per section, every headline in the site's
 * decided voice (assertion + negation, MASTER.md), copy rebuilt around the
 * product as it now works: one message becomes the whole video, and the
 * creator directs it scene by scene in plain language.
 *
 * Motion budget: the hero words blur in once, the stage's narration line
 * lights word by word once — the mechanism the product actually runs on —
 * then everything settles. No scroll pinning, no ambient loops.
 */

const NARRATION = "Attention lets every word ask every other word what it means.";

export function WaitlistLanding() {
  return (
    <div className="min-h-screen bg-page text-ink antialiased">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-6 pt-7">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-ink font-display text-[13px] font-semibold text-white">
            D
          </span>
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">Decode</span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.14em] text-t7 uppercase">
          Private beta
        </span>
      </header>

      {/* ------------------------------------------------ hero */}
      <section className="mx-auto w-full max-w-[1120px] px-6 pt-[clamp(56px,9vh,96px)]">
        <h1
          className="font-serif leading-[1.02] tracking-[-0.02em] text-ink"
          style={{ fontSize: "clamp(46px, 8.2vw, 104px)" }}
        >
          <span className="landing-word" style={{ animationDelay: "0ms" }}>
            Ask
          </span>{" "}
          <span className="landing-word" style={{ animationDelay: "55ms" }}>
            a
          </span>{" "}
          <span className="landing-word" style={{ animationDelay: "110ms" }}>
            question.
          </span>
          <br />
          <span className="landing-word text-t9" style={{ animationDelay: "165ms" }}>
            Get a video that
          </span>{" "}
          <span
            className="landing-word font-hand text-accent"
            style={{ animationDelay: "220ms", fontSize: "0.94em" }}
          >
            teaches.
          </span>
        </h1>
        <p className="mt-7 max-w-[52ch] text-[clamp(15px,1.4vw,17px)] leading-[1.7] text-t5">
          Type a question like “How does backpropagation work?” and Decode makes you
          an animated video that walks through it properly, with narration and
          visuals built to teach. Not a wall of text to skim.
        </p>
        <WaitlistForm id="hero" className="mt-9" />

        {/* The stage: the product's real material — one dark canvas, scenes
            transparent over it, narration as the clock. Shown, not claimed. */}
        <figure className="mt-[clamp(48px,8vh,84px)]">
          <div className="overflow-hidden rounded-[28px] bg-[#0B0B0B] px-[clamp(24px,5vw,72px)] py-[clamp(36px,6vh,64px)] shadow-[0_32px_80px_-32px_rgb(20_20_20/0.45)]">
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.14em] text-[#7E7E7E] uppercase">
              <span>Scene 04 · Attention</span>
              <span>1920 × 1080</span>
            </div>
            <div className="mt-[clamp(28px,5vh,48px)] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-center gap-[clamp(20px,4vw,48px)]">
              <div className="rounded-[18px] border-2 border-[#484848] bg-[#232323] px-6 py-7 text-center">
                <div className="font-mono text-[10px] tracking-[0.12em] text-[#8A8A86] uppercase">
                  the animal
                </div>
                <div className="mt-2 text-[clamp(18px,2vw,24px)] font-semibold text-[#F5F5F5]">
                  “it”
                </div>
              </div>
              <div className="flex items-center gap-2" aria-hidden>
                <div className="h-[2px] flex-1 bg-[#F2A47B]" />
                <span className="font-mono text-[10px] tracking-[0.12em] text-[#F2A47B] uppercase">
                  attends to
                </span>
                <div className="h-[2px] flex-1 bg-[#F2A47B]" />
                <div className="h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-[#F2A47B]" />
              </div>
              <div className="rounded-[18px] border-2 border-[#484848] bg-[#232323] px-6 py-7 text-center">
                <div className="font-mono text-[10px] tracking-[0.12em] text-[#8A8A86] uppercase">
                  the referent
                </div>
                <div className="mt-2 text-[clamp(18px,2vw,24px)] font-semibold text-[#F5F5F5]">
                  “the street”
                </div>
              </div>
            </div>
            <p className="mt-[clamp(28px,5vh,48px)] text-center text-[clamp(14px,1.5vw,17px)] leading-[1.7]">
              {NARRATION.split(" ").map((word, index) => (
                <span
                  key={index}
                  className="landing-narration-word"
                  style={{ animationDelay: `${900 + index * 170}ms` }}
                >
                  {word}{" "}
                </span>
              ))}
            </p>
          </div>
          <figcaption className="mt-3 text-center font-mono text-[10px] tracking-[0.12em] text-t8 uppercase">
            Narration is the clock. Every visual lands on the words that name it.
          </figcaption>
        </figure>
      </section>

      {/* ------------------------------------------------ three decisions */}
      <section className="mx-auto w-full max-w-[1120px] px-6 pt-[clamp(72px,12vh,128px)]">
        <h2 className="font-serif tracking-[-0.015em]" style={{ fontSize: "clamp(34px,5vw,56px)" }}>
          One question,
          <span className="text-t9"> and Decode does the rest.</span>
        </h2>
        <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-12 gap-y-8 border-t border-line pt-8">
          {[
            {
              step: "01",
              name: "Ask",
              body: "Type your question. Or drop in a paper, a doc, the chapter you’re stuck on. One message is all Decode needs.",
            },
            {
              step: "02",
              name: "Watch it build",
              body: "Decode plans the lesson, writes the narration, then animates each scene. It tells you what it’s doing while it works, so you’re never staring at a spinner.",
            },
            {
              step: "03",
              name: "Watch it teach",
              body: "A few minutes later you have a film that actually explains the thing, start to finish, timed to its own narration.",
            },
          ].map((item) => (
            <div key={item.step}>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] tracking-[0.1em] text-accent-deep">
                  {item.step}
                </span>
                <span className="font-display text-[19px] font-semibold tracking-[-0.01em]">
                  {item.name}
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-[1.7] text-t5">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ a lesson, not a summary */}
      <section className="mx-auto w-full max-w-[1120px] px-6 pt-[clamp(72px,12vh,128px)]">
        <h2 className="font-serif tracking-[-0.015em]" style={{ fontSize: "clamp(34px,5vw,56px)" }}>
          A film that teaches.
          <span className="text-t9"> Not a chatbot that talks.</span>
        </h2>
        <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-12 gap-y-8 border-t border-line pt-8">
          {[
            {
              name: "Planned like a lesson",
              body: "Decode works out what you need to see first and what builds on it, the way a good teacher would. The video has a through-line, not paragraphs read aloud over slides.",
            },
            {
              name: "Drawn to show the mechanism",
              body: "The scenes animate the idea itself: the parts, how they connect, the step where it finally makes sense. No stock footage with a voice on top.",
            },
            {
              name: "Timed by the narration",
              body: "The voice is the clock. Every visual lands on the words that name it, so the film never drifts out of sync with what it’s saying.",
            },
          ].map((item) => (
            <div key={item.name}>
              <div className="font-display text-[17px] font-semibold tracking-[-0.01em]">
                {item.name}
              </div>
              <p className="mt-3 text-[14px] leading-[1.7] text-t5">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ closing */}
      <section className="mx-auto w-full max-w-[1120px] px-6 pb-[clamp(72px,12vh,120px)] pt-[clamp(80px,14vh,144px)]">
        <div className="border-t border-line pt-[clamp(48px,8vh,80px)] text-center">
          <h2 className="font-serif tracking-[-0.015em]" style={{ fontSize: "clamp(34px,5vw,56px)" }}>
            Bring a question.
            <span className="text-t9"> Leave with a film.</span>
          </h2>
          <WaitlistForm id="footer" className="mx-auto mt-8 justify-center" />
          <p className="mt-14 font-mono text-[10px] tracking-[0.14em] text-t8 uppercase">
            Decode — ask a question, get a video explanation
          </p>
        </div>
      </section>
    </div>
  );
}

function WaitlistForm({ id, className }: { id: string; className?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { ok: boolean; message?: string };
      if (body.ok) {
        setState("done");
      } else {
        setState("error");
        setMessage(body.message ?? "We couldn’t save that just now. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("We couldn’t save that just now. Please try again.");
    }
  };

  if (state === "done") {
    return (
      <p className={`flex items-center gap-2 text-[15px] text-ink-2 ${className ?? ""}`}>
        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] text-white">
          ✓
        </span>
        You’re on the list — we’ll write when it’s your turn.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={className}>
      <div
        className={`flex w-full max-w-[440px] flex-wrap items-center gap-2.5 ${
          className?.includes("justify-center") ? "mx-auto" : ""
        }`}
      >
        <label htmlFor={`waitlist-${id}`} className="sr-only">
          Email address
        </label>
        <input
          id={`waitlist-${id}`}
          type="email"
          required
          autoComplete="email"
          placeholder="you@university.edu"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state === "error") setState("idle");
          }}
          className="h-[46px] min-w-[220px] flex-1 rounded-[12px] border border-line-input bg-white px-4 text-[14px] text-ink outline-none placeholder:text-t9 focus:border-accent"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="h-[46px] rounded-[12px] px-5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-50"
          style={{
            background: "linear-gradient(180deg, var(--color-accent-top), var(--color-accent))",
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.22), 0 8px 24px -8px rgb(194 65 12 / 0.32)",
          }}
        >
          {state === "sending" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      {state === "error" && (
        <p role="alert" className="mt-2 text-[12.5px] text-[#8E2F19]">
          {message}
        </p>
      )}
    </form>
  );
}
