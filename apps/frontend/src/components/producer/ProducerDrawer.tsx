"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { projectCards } from "@/lib/api";
import { num } from "@/lib/derive";
import { useStudio } from "@/store/studio";
import { AppMark, Ghost, Graphite, Spinner, cx } from "@/components/ui/primitives";

/**
 * The Production room — conversation, scoped proposals and change receipts.
 *
 * Opaque on purpose (`#FCFCFB`, z-index 80). A translucent panel let the
 * sticky header's Export button read through the drawer and become an
 * unclickable ghost target; that is a recorded regression, not a taste call.
 */

interface QuickAction {
  label: string;
  /** What the Producer says back, once it has actually done the thing. */
  run: () => void;
  /** Milliseconds before the reply lands — long enough to read as work. */
  delay?: number;
  /** Shown next to the spinner while that work is pending. */
  working?: string;
  /** Mutations are scoped and confirmed before their `run` function fires. */
  proposal?: {
    title: string;
    scope: string;
    untouched: string;
  };
}

export function ProducerDrawer() {
  const open = useStudio((s) => s.threadOpen);
  const thread = useStudio((s) => s.thread);
  const draft = useStudio((s) => s.draft);
  const thinking = useStudio((s) => s.thinking);
  const screen = useStudio((s) => s.screen);
  const tab = useStudio((s) => s.tab);
  const source = useStudio((s) => s.source);
  const pstep = useStudio((s) => s.pstep);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const sc = useStudio((s) => s.sc);

  const toggleThread = useStudio((s) => s.toggleThread);
  const setThreadOpen = useStudio((s) => s.setThreadOpen);
  const say = useStudio((s) => s.say);
  const ask = useStudio((s) => s.ask);
  const setDraft = useStudio((s) => s.setDraft);
  const setThinking = useStudio((s) => s.setThinking);
  const tightenActTwo = useStudio((s) => s.tightenActTwo);
  const shortenCurrent = useStudio((s) => s.shortenCurrent);
  const reorder = useStudio((s) => s.reorder);
  const applyRegen = useStudio((s) => s.applyRegen);

  /* Every pending reply is tracked so unmounting can never fire a setState
     into a dead component. */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const workingLine = useRef("Reworking the plan…");
  const [proposal, setProposal] = useState<QuickAction | null>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
    };
  }, []);

  // A proposal belongs to the exact screen, stage and scene where it was
  // scoped. Moving elsewhere invalidates it instead of applying it blindly.
  useEffect(() => {
    setProposal(null);
  }, [screen, tab, sceneIdx]);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /* ---------------------------------------------------------------- */
  /* Access — ⌘J / Ctrl+J toggles, Esc closes                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleThread();
        return;
      }
      if (e.key === "Escape") setThreadOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleThread, setThreadOpen]);

  /* ---------------------------------------------------------------- */
  /* Live context line — what the Producer is currently looking at     */
  /* ---------------------------------------------------------------- */

  const context = useMemo(() => {
    if (screen === "dashboard")
      return `Looking at your studio · ${projectCards("").length} decodes`;
    if (screen === "upload") return "Looking at the new decode brief";
    if (screen === "processing")
      return `Preparing ${source.title} · step ${Math.min(pstep + 1, 7)} of 7`;
    if (screen !== "project") return "Knows the source and the plan";

    const cur = sc[sceneIdx];
    switch (tab) {
      case "overview":
        return "Looking at Understanding · 37 concepts";
      case "plan":
        return `Looking at the Teaching Plan · ${sc.length} beats`;
      case "script":
        return `Looking at Script · scene ${num(sceneIdx)}`;
      case "edit":
        return `Looking at Scene ${num(sceneIdx)}${cur ? ` · ${cur.title}` : ""}`;
      case "export":
        return "Looking at Export settings";
      default:
        return "Knows the source and the plan";
    }
  }, [screen, tab, sceneIdx, sc, source.title, pstep]);

  /* ---------------------------------------------------------------- */
  /* Quick actions — different per screen, and they really act         */
  /* ---------------------------------------------------------------- */

  const actions = useMemo<QuickAction[]>(() => {
    const talk = (label: string, reply: string): QuickAction => ({
      label,
      run: () => say(reply),
      delay: 850,
      working: "Checking before I answer…",
    });

    if (screen === "dashboard")
      return [
        talk(
          "What should I decode next?",
          "Your docs decode is the only one without a sequel. The chapter that follows it would reuse half the visuals I already built.",
        ),
        talk(
          "Summarise my last decode",
          "Ch. 10 ran 7:02 across eleven beats — two over what I recommended. Act II carries the weight.",
        ),
      ];

    if (screen === "upload")
      return [
        talk(
          "Is my brief specific enough?",
          "Name what they already know. That's what lets me skip the setup and spend the runtime on the mechanism instead.",
        ),
        talk(
          "How long should this be?",
          "For this source, 5–6 minutes. Past eight, retention falls faster than comprehension rises.",
        ),
      ];

    if (screen === "processing")
      return [
        talk(
          "What are you doing now?",
          "I’m turning your source into editable work: first the key ideas, then the teaching plan, script, and boards. Nothing is rendering yet.",
        ),
        talk(
          "Can I change the brief?",
          "Yes. Go back to New Decode before approving Understanding and I’ll rebuild the plan from the revised intent.",
        ),
      ];

    if (screen !== "project")
      return [
        talk(
          "What are you looking at?",
          "The project as a whole — I know the source, the plan, and which beats are still waiting on you.",
        ),
      ];

    if (tab === "overview")
      return [
        talk(
          "What did you leave out?",
          "Label smoothing, beam search width, and the byte-pair details. They're real, but they don't change the mental model — so I cut them.",
        ),
        talk(
          "What must they know first?",
          "Dot products, softmax, and what a hidden state is. Everything else I teach on the way through.",
        ),
      ];

    if (tab === "plan") {
      /* "Beat 07" in the spec — clamped, because the plan is editable. */
      const resultsBeat = Math.min(6, sc.length - 1);
      return [
        {
          label: "Tighten act II by 20s",
          delay: 700,
          working: "Scoping the timing change…",
          proposal: {
            title: "Tighten act II by 20 seconds",
            scope: "Four mechanism beats · duration only",
            untouched: "Act I, Act III, beat order and approved narration",
          },
          run: () => tightenActTwo(),
        },
        {
          label: "Open with the results instead",
          delay: 700,
          working: "Checking the dependency chain…",
          proposal: {
            title: "Move the results beat to the opening",
            scope: "Beat order · plan and script approvals reset",
            untouched: "Every beat, duration and existing draft stays available",
          },
          run: () => {
            if (resultsBeat <= 0) {
              say(
                "The results beat is already first — there's nothing to move.",
              );
              return;
            }
            reorder(resultsBeat, 0);
            say(
              "Cold-opened on the numbers so the mechanism arrives as the explanation rather than the setup. Same beats, same runtime — only the order moved.",
            );
          },
        },
        {
          label: "Add a beat on why RNNs failed",
          delay: 850,
          working: "Checking the plan before I answer…",
          run: () =>
            say(
              "I'd rather not. Beat 01 already spends 38 seconds on the bottleneck, and a second beat on the same failure delays attention past the point where they're still curious. If it isn't landing, I'd make beat 01 longer instead.",
            ),
        },
      ];
    }

    if (tab === "script")
      return [
        {
          label: "Make this scene plainer",
          delay: 700,
          working: "Scoping the rewrite…",
          proposal: {
            title: `Rewrite scene ${num(sceneIdx)} in plainer language`,
            scope: `Scene ${num(sceneIdx)} · narration and everything that follows`,
            untouched: "Every other scene, the teaching plan and approvals",
          },
          run: () => {
            applyRegen(sceneIdx, "scene");
            say(
              `Rewrote scene ${num(sceneIdx)} without the jargon and kept it the same length. No other scene moved.`,
              "1 scene rewritten",
            );
          },
        },
        talk(
          "Where does the pacing drag?",
          "Beats 03 and 06. Both carry two ideas — splitting either one helps more than trimming words from it.",
        ),
      ];

    if (tab === "edit")
      return [
        talk(
          "Why this visual?",
          "The chips stand in for tokens so the attention weights have somewhere to land. I tried abstract shapes first and they tested worse on recall.",
        ),
        {
          label: "Make this scene shorter",
          delay: 700,
          working: "Checking the current timing…",
          proposal: {
            title: `Shorten scene ${num(sceneIdx)} by eight seconds`,
            scope: `Scene ${num(sceneIdx)} · duration and voice timing`,
            untouched: "Narration, visuals and every other scene",
          },
          run: () => shortenCurrent(),
        },
      ];

    if (tab === "export")
      return [
        talk(
          "Which format should I pick?",
          "MP4 at 1080p for anywhere people actually watch. ProRes only if this goes into another edit afterwards.",
        ),
        talk(
          "Is it ready to render?",
          "Every beat is approved and the timeline has no gaps. I'd ship it.",
        ),
      ];

    return [
      talk(
        "What are you looking at?",
        "The project as a whole — the source, the plan, and every beat I've drafted so far.",
      ),
    ];
  }, [
    screen,
    tab,
    sc.length,
    sceneIdx,
    say,
    reorder,
    tightenActTwo,
    shortenCurrent,
    applyRegen,
  ]);

  const runAction = useCallback(
    (a: QuickAction) => {
      setProposal(null);
      ask(a.label);
      workingLine.current = a.working ?? "Working on it…";
      setThinking(true);
      after(a.delay ?? 800, () => {
        setThinking(false);
        if (a.proposal) {
          setProposal(a);
          say(
            `I scoped that change to ${a.proposal.scope.toLowerCase()}. Review the boundary below before anything moves.`,
          );
        } else {
          a.run();
        }
      });
    },
    [ask, setThinking, say, after],
  );

  const send = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    setProposal(null);
    ask(t);
    setDraft("");
    workingLine.current = "Reading that against the current draft…";
    setThinking(true);
    after(900, () => {
      setThinking(false);
      say(
        screen === "project"
          ? `I’ve got the direction. Before I change anything: should this apply only to scene ${num(sceneIdx)}, or to every similar beat in this stage? Nothing has changed yet.`
          : "I’ve got the direction. I’ll keep it with the project brief; nothing has changed yet.",
      );
    });
  }, [draft, ask, setDraft, setThinking, say, after, screen, sceneIdx]);

  /* Newest message stays in view. Jump, don't animate — the drawer has no
     entrance motion and a smooth scroll would read as one. */
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  /**
   * Grow the field to fit what is in it, up to a ceiling.
   *
   * Measured from `scrollHeight`, which needs the height reset to `auto`
   * first — otherwise the box can only ever grow, never shrink back when you
   * delete a line. Above the ceiling it scrolls, so the thread never gets
   * squeezed out by a long note.
   */
  useEffect(() => {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [draft]);
  useEffect(() => {
    const el = scroller.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [thread.length, thinking, open]);

  return (
    <aside
      aria-label="Production room"
      aria-hidden={!open}
      className={cx(
        // A floating panel, not a wall.
        //
        // It used to be flush to all three edges with square corners, so
        // opening it read as the app being replaced rather than something
        // arriving beside your work. Inset and rounded, it sits *over* the
        // studio and the studio stays visible around it — which matters,
        // because the room is commenting on what you are looking at.
        "fixed right-3 bottom-3 z-80 flex w-[380px] max-w-[calc(100vw-1.5rem)] flex-col",
        "top-[calc(var(--header-h)+0.75rem)]",
        "overflow-hidden rounded-[20px] border border-white/70 bg-drawer",
        "shadow-[0_28px_70px_rgb(30_30_28_/_0.22)]",
        "transition-[translate,opacity,visibility] duration-[250ms] ease-decode",
        open
          ? "visible translate-x-0 opacity-100"
          : "invisible translate-x-[calc(100%+1rem)] opacity-0",
      )}
    >
      {/* header ---------------------------------------------------- */}
      <div className="flex flex-none items-center gap-[9px] border-b border-line-inner px-4 py-3.5">
        <AppMark gradient size={22} radius={7} font={11} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Production room</div>
          <div className="truncate text-[10.5px] text-t8">{context}</div>
        </div>
        <button
          type="button"
          onClick={() => setThreadOpen(false)}
          aria-label="Close the production room"
          className="flex-none border-none bg-transparent text-[15px] leading-none text-t10 transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>

      {/* thread ---------------------------------------------------- */}
      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4"
      >
        {/* Pushes a short thread down to meet the composer. Without it two
            messages sat at the top with 500px of dead panel beneath them. */}
        <div className="mt-auto" />

        {thread.map((m, i) => {
          const mine = m.who === "u";
          const opensTurn = i === 0 || thread[i - 1].who !== m.who;

          return (
            <div
              key={m.id}
              className={cx(
                "flex max-w-[90%] flex-col",
                mine ? "self-end items-end" : "self-start",
                opensTurn && i > 0 && "mt-1.5",
              )}
            >
              {/* Attribution only when the speaker changes — repeating it on
                  every consecutive message is noise, not clarity. */}
              {opensTurn && !mine && (
                <span className="mb-1 flex items-center gap-1.5 pl-0.5">
                  <AppMark gradient size={15} radius={5} font={8} />
                  <span className="font-mono text-[9px] tracking-[0.12em] text-t9 uppercase">
                    Decode crew
                  </span>
                </span>
              )}

              <div
                className={cx(
                  "overflow-hidden rounded-[13px] text-[12.5px] leading-[1.55]",
                  mine
                    ? "bg-ink text-[#F2F2F0]"
                    : "border border-line-inner bg-card text-ink-2",
                )}
              >
                <div className="px-3 py-2.5">{m.text}</div>

                {/* The receipt belongs to the message, not beside it. Detached,
                    it read as a separate item in the thread rather than proof
                    attached to what was just said. */}
                {m.receipt ? (
                  <div
                    className={cx(
                      "flex items-center gap-1.5 border-t px-3 py-1.5",
                      mine
                        ? "border-white/12 bg-white/5"
                        : "border-line-inner bg-sunken",
                    )}
                  >
                    <Check
                      size={10}
                      strokeWidth={2.6}
                      aria-hidden
                      className={mine ? "text-white/70" : "text-accent-deep"}
                    />
                    <span
                      className={cx(
                        "font-mono text-[9.5px] tracking-[0.06em]",
                        mine ? "text-white/70" : "text-t7",
                      )}
                    >
                      {m.receipt}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {/* Never a bare spinner — it always says what it is doing. */}
        {thinking ? (
          <div className="flex items-center gap-2 self-start pt-0.5 pl-0.5">
            <Spinner size={13} />
            <span className="text-[11.5px] text-t8">{workingLine.current}</span>
          </div>
        ) : null}
      </div>

      {/* quick actions + composer ---------------------------------- */}
      <div className="flex-none border-t border-line-inner px-4 pt-3 pb-3.5">
        {proposal?.proposal && (
          <div className="mb-3 overflow-hidden rounded-[14px] border border-[var(--accent-line)] bg-[var(--accent-tint)]">
            <div className="border-b border-[var(--accent-line)] px-3 py-2.5">
              <div className="font-mono text-[8.5px] tracking-[0.13em] text-accent-deep uppercase">
                Proposed change
              </div>
              <div className="mt-1 text-[12.5px] font-medium text-ink">
                {proposal.proposal.title}
              </div>
            </div>
            <div className="grid gap-2 px-3 py-2.5">
              <ProposalLine label="Changes" value={proposal.proposal.scope} />
              <ProposalLine label="Keeps" value={proposal.proposal.untouched} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--accent-line)] px-3 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setProposal(null);
                  say("Kept the current draft. Nothing changed.");
                }}
                className="rounded-full px-3 py-1.5 text-[11.5px] font-medium text-t6 transition-colors hover:text-ink"
              >
                Keep current
              </button>
              <Graphite
                type="button"
                onClick={() => {
                  const action = proposal;
                  setProposal(null);
                  action.run();
                }}
                className="px-3.5 py-1.5 text-[11.5px] font-medium"
              >
                Apply change
              </Graphite>
            </div>
          </div>
        )}

        <div className="rail-x -mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {actions.map((a) => (
            <Ghost
              key={a.label}
              type="button"
              onClick={() => runAction(a)}
              disabled={thinking || proposal !== null}
              className="max-w-full flex-none overflow-hidden px-3 py-1.5 text-[11.5px] text-ellipsis whitespace-nowrap disabled:opacity-50"
            >
              {a.label}
            </Ghost>
          ))}
        </div>

        {/* The field grows with what you write.
            It was `rows={1}` with no auto-grow, so the second line of any real
            sentence scrolled out of sight the moment it wrapped — you could not
            read back what you had typed. `items-end` also bottom-aligned a
            19px text box against a 24px button, leaving the text sitting a
            couple of pixels low. Both are fixed by giving the field a real
            line box and letting the row centre on it. */}
        <div className="flex items-center gap-2 rounded-[14px] border border-line-input bg-card px-2.5 py-1.5">
          <textarea
            ref={composer}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Write in the production room"
            placeholder="Describe a change, or ask why…"
            className="max-h-[112px] min-h-[28px] flex-1 resize-none self-center border-none bg-transparent py-[5px] text-[12.5px] leading-[18px] placeholder:text-t9"
          />
          <Graphite
            type="button"
            onClick={send}
            aria-label="Send production note"
            className="flex h-7 w-7 flex-none items-center justify-center self-end text-[10px]"
          >
            ↑
          </Graphite>
        </div>

        {/* The one cross-link back to the do-layer. The palette's footer
            points here ("⌘J to talk instead"); this is its mirror. Each
            surface names the other exactly once, so the split is learnable
            without either becoming a menu of the other. */}
        <button
          type="button"
          onClick={() => {
            setThreadOpen(false);
            window.dispatchEvent(new Event("decode:palette"));
          }}
          className="mt-2 w-full text-center font-mono text-[9px] tracking-[0.1em] text-t9 uppercase transition-colors hover:text-t6"
        >
          ⌘K to act directly
        </button>
      </div>
    </aside>
  );
}

function ProposalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[46px_minmax(0,1fr)] gap-2">
      <span className="font-mono text-[8.5px] tracking-[0.08em] text-t9 uppercase">
        {label}
      </span>
      <span className="text-[10.5px] leading-[1.45] text-t6">{value}</span>
    </div>
  );
}
