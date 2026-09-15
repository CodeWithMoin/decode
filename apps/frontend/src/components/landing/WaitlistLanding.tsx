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


export function WaitlistLanding() {
  return (
    <div className="min-h-screen bg-page text-ink antialiased">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-6 pt-7">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a tiny static SVG */}
          <img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
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
          <div className="overflow-hidden rounded-[28px] bg-[#0B0B0B] p-[clamp(8px,1vw,14px)] shadow-[0_32px_80px_-32px_rgb(20_20_20/0.45)]">
            <div className="flex items-center justify-between px-3 pt-1 pb-3 font-mono text-[10px] tracking-[0.14em] text-[#7E7E7E] uppercase">
              <span>A generated lesson · self-attention → transformer → gradient descent</span>
              <span>1920 × 1080</span>
            </div>
            {/* Real pipeline output — one generated, narrated lesson. Shown, not claimed. */}
            <video
              className="block w-full rounded-[18px]"
              src="/demo.mp4"
              poster="/demo-poster.png"
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              aria-label="A Decode-generated lesson: self-attention, the transformer stack, and gradient descent"
            />
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

      {/* ------------------------------------------------ a lesson, not a summary.
          Evidence, not claims: these are real frames the pipeline generated,
          each drawing the mechanism the narration is explaining at that moment. */}
      <section className="mx-auto w-full max-w-[1120px] px-6 pt-[clamp(72px,12vh,128px)]">
        <h2 className="font-serif tracking-[-0.015em]" style={{ fontSize: "clamp(34px,5vw,56px)" }}>
          A film that teaches.
          <span className="text-t9"> Not a chatbot that talks.</span>
        </h2>
        <p className="mt-6 max-w-[58ch] text-[clamp(15px,1.4vw,17px)] leading-[1.7] text-t5">
          No stock footage with a voice on top. Every scene draws the idea itself —
          the parts, how they connect, the step where it clicks — and lands on the
          words that name it. These four frames came out of one generated lesson.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 border-t border-line pt-8 sm:grid-cols-2">
          {[
            {
              src: "/frames/transformer.png",
              alt: "The transformer stack drawn as blocks: embedding, attention, add and norm, feed forward, with residual connections arcing past each",
              caption: "The transformer stack, with the residual connections that skip around each block.",
            },
            {
              src: "/frames/attention.png",
              alt: "Five token chips with arcs between them; a thicker arc from “it” back to “cat”",
              caption: "Attention across a sentence — a thicker arc is a stronger weight.",
            },
            {
              src: "/frames/matrix.png",
              alt: "A matrix multiply Q times K-transpose with one row of Q, one column of K and their output cell highlighted together",
              caption: "Scores = Q × Kᵀ: one row dotted with one column makes one cell.",
            },
            {
              src: "/frames/gradient.png",
              alt: "Contour rings of a loss landscape with a path of steps walking to the minimum at the centre",
              caption: "Gradient descent walking downhill to the minimum, one step per spoken beat.",
            },
          ].map((frame) => (
            <figure key={frame.src} className="m-0">
              <div className="overflow-hidden rounded-[16px] border border-line-strong bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- static generated frames, fixed 16:9, no need for the image optimizer */}
                <img src={frame.src} alt={frame.alt} width={1920} height={1080} loading="lazy" className="block h-auto w-full" />
              </div>
              <figcaption className="mt-3 text-[14px] leading-[1.6] text-t5">{frame.caption}</figcaption>
            </figure>
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
