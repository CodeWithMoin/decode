"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, PaperPlaneTilt } from "@phosphor-icons/react";
import { num, observations } from "@/lib/derive";
import { decodeApi } from "@/lib/decode-api";
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
  const connectedProjectId = useStudio((s) => s.connectedProjectId);
  const directScene = useStudio((s) => s.directScene);

  /* Every pending reply is tracked so unmounting can never fire a setState
     into a dead component. */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const workingLine = useRef("Reworking the plan…");
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [proposal, setProposal] = useState<QuickAction | null>(null);
  const docked = screen === "project";
  const dark = docked && tab === "edit";
  const turns = useMemo(
    () =>
      thread.reduce<Array<{ who: "u" | "p"; messages: typeof thread }>>((groups, message) => {
        const last = groups.at(-1);
        if (last?.who === message.who) last.messages.push(message);
        else groups.push({ who: message.who, messages: [message] });
        return groups;
      }, []),
    [thread],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
    };
  }, []);

  // A proposal belongs to the exact screen, stage and scene where it was
  // scoped. Moving elsewhere invalidates it instead of applying it blindly.
  //
  // The functional form matters. Stage changes run through `changeProjectStage`,
  // which calls `flushSync` inside `startViewTransition` — so this effect fires
  // during a synchronous render, and an unconditional `setProposal(null)` was
  // one more nested update on every stage switch even when there was nothing to
  // clear. Returning the same reference lets React bail out entirely.
  useEffect(() => {
    setProposal((current) => (current === null ? current : null));
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
        if (docked && window.matchMedia("(min-width: 1024px)").matches) {
          composer.current?.focus();
          return;
        }
        toggleThread();
        return;
      }
      if (
        e.key === "Escape" &&
        (!docked || !window.matchMedia("(min-width: 1024px)").matches)
      ) {
        setThreadOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docked, toggleThread, setThreadOpen]);

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

    // Connected: the real orchestrator. A turn returns a reply and, when it maps
    // to a tool, a scoped proposal — which reuses the same proposal card + Apply
    // as the seeded actions. Apply runs the real per-scene tool; nothing has
    // moved until then (propose → apply → receipt).
    if (connectedProjectId) {
      workingLine.current = "Reading that against the current cut…";
      setThinking(true);
      decodeApi
        .orchestratorTurn(connectedProjectId, t)
        .then((turn) => {
          setThinking(false);
          say(turn.reply);
          const p = turn.proposal;
          if (p) {
            setProposal({
              label: p.summary,
              proposal: { title: p.summary, scope: p.changes, untouched: p.untouched },
              run: () => {
                if (p.tool === "direct_scene" && directScene) {
                  void directScene(p.args.beat_id, p.args.direction);
                }
              },
            });
          }
        })
        .catch(() => {
          setThinking(false);
          say("I couldn’t reach the studio just now — nothing changed. Try again in a moment.");
        });
      return;
    }

    // Prototype: the seeded reply.
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
  }, [
    draft,
    ask,
    setDraft,
    setThinking,
    say,
    after,
    screen,
    sceneIdx,
    connectedProjectId,
    directScene,
  ]);

  /* Newest message stays in view. Jump, don't animate — a second scroll
     animation would compete with the panel's own materialization. */
  useEffect(() => {
    if (!open || (docked && window.matchMedia("(min-width: 1024px)").matches)) return;
    const frame = window.requestAnimationFrame(() => composer.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [docked, open]);

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
    if (el && (open || docked)) el.scrollTop = el.scrollHeight;
  }, [thread.length, thinking, open, docked]);

  return (
    <aside
      aria-label="Project Chat"
      aria-hidden={!open && !docked ? true : undefined}
      inert={!open && !docked}
      data-open={open || undefined}
      data-docked={docked || undefined}
      className={cx(
        // Two shapes, one panel.
        //
        // From lg up it is docked: a column on the left of the work, always
        // there, because the conversation is how the production is directed
        // and hunting for it made it feel optional. Below lg there is no room
        // for a third column, so it stays the floating panel it was — inset
        // and rounded, sitting *over* the studio with the studio still visible
        // around it, because the room is commenting on what you are looking at.
        //
        // Open/closed is styling, not `inert`: see `.production-room`.
        "production-room flex flex-col overflow-hidden",
        "fixed right-3 bottom-3 z-80 w-[380px] max-w-[calc(100vw-1.5rem)]",
        "top-[calc(var(--header-h)+3.5rem)]",
        "rounded-[20px] border border-white/70 shadow-[0_28px_70px_rgb(30_30_28_/_0.22)]",
        docked && "lg:static lg:inset-auto lg:z-auto lg:h-full lg:w-[344px] lg:max-w-none lg:flex-none lg:rounded-none lg:border-0",
        dark
          ? "bg-[var(--nle-panel)] text-[var(--nle-text)] lg:shadow-[14px_0_34px_rgb(0_0_0_/_0.2)]"
          : "bg-drawer lg:shadow-[12px_0_30px_rgb(30_30_28_/_0.08)]",
      )}
    >
      {/* thread ---------------------------------------------------- */}
      <div
        ref={scroller}
        className={cx("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3", docked && "rail-y")}
      >
        {/* Bottom-aligned only while the panel floats.
            The spacer was added when the room was a short overlay, where two
            messages left 500px of dead panel beneath them. Docked full height
            the problem inverts — the same spacer strands the conversation at
            the bottom of the window with the dead space above it — so the
            thread starts at the top and grows down from there. */}
        <div className={cx("mt-auto", docked && "hidden")} />

        {turns.map((turn) => {
          const mine = turn.who === "u";

          return (
            <div
              key={turn.messages[0].id}
              className={cx(
                "flex w-full flex-col",
                mine && "items-end",
              )}
            >
              <div
                className={cx(
                  "overflow-hidden rounded-[12px] text-[12.5px] leading-[1.65]",
                  mine ? "w-fit max-w-[88%]" : "w-full",
                  dark
                    ? "bg-[var(--nle-panel-raised)] text-[var(--nle-text)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04),0_10px_24px_rgb(0_0_0_/_0.14)]"
                    : "bg-card text-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.9),0_8px_22px_rgb(30_30_28_/_0.07)]",
                  mine && (dark ? "bg-[#242424]" : "bg-sunken-4"),
                )}
              >
                <div className="grid gap-3 px-3.5 py-3">
                  {!mine && (
                    <span className="flex items-center gap-1.5">
                      <AppMark gradient size={15} radius={5} font={8} />
                      <span className={cx("font-mono text-[9px] tracking-[0.12em] uppercase", dark ? "text-[var(--nle-faint)]" : "text-t9")}>Decode</span>
                    </span>
                  )}
                  {turn.messages.map((message) => (
                    <div key={message.id} className="grid gap-2">
                      <div>{message.text}</div>
                      {message.receipt ? (
                        <div className="flex items-center gap-1.5">
                          <Check size={10} weight="bold" aria-hidden className="text-accent-deep" />
                          <span className={cx("font-mono text-[9.5px] tracking-[0.06em]", dark ? "text-[var(--nle-muted)]" : "text-t7")}>{message.receipt}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
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
      <div className={cx("flex-none px-4 pt-3 pb-3.5", dark ? "bg-[var(--nle-panel)] shadow-[0_-12px_28px_rgb(0_0_0_/_0.2)]" : "bg-drawer shadow-[0_-10px_24px_rgb(30_30_28_/_0.07)]")}>
        {proposal?.proposal && (
          <div className={cx("mb-3 overflow-hidden rounded-[12px] border border-[var(--accent-line)]", dark ? "bg-[var(--nle-panel-raised)]" : "bg-[var(--accent-tint)]")}>
            <div className="border-b border-[var(--accent-line)] px-3 py-2.5">
              <div className="font-mono text-[8.5px] tracking-[0.13em] text-accent-deep uppercase">
                Proposed change
              </div>
              <div className={cx("mt-1 text-[12.5px] font-medium", dark ? "text-[var(--nle-text)]" : "text-ink")}>
                {proposal.proposal.title}
              </div>
            </div>
            <div className="grid gap-2 px-3 py-2.5">
              <ProposalLine label="Changes" value={proposal.proposal.scope} dark={dark} />
              <ProposalLine label="Keeps" value={proposal.proposal.untouched} dark={dark} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--accent-line)] px-3 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setProposal(null);
                  say("Kept the current draft. Nothing changed.");
                }}
                className={cx("rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors", dark ? "text-[var(--nle-muted)] hover:text-[var(--nle-text)]" : "text-t6 hover:text-ink")}
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
                className={cx("px-3.5 py-1.5 text-[11.5px] font-medium", dark && "bg-[var(--accent)] text-white")}
              >
                Apply change
              </Graphite>
            </div>
          </div>
        )}

        <Noticed dark={dark} />

        {/* Wrapped, not a horizontal scroller. Docked, the room is narrower
            than the floating panel was, and a sideways-scrolling row of two or
            three suggestions reads as a truncated one — the second action
            looked broken rather than scrollable. */}
        <div className="-mx-1 mb-2.5 flex flex-wrap gap-1.5 px-1 pb-0.5">
          {actions.map((a) => (
            dark ? (
              <button
                key={a.label}
                type="button"
                onClick={() => runAction(a)}
                disabled={thinking || proposal !== null}
                className="max-w-full rounded-lg border border-[var(--nle-line)] bg-[var(--nle-panel-raised)] px-3 py-1.5 text-left text-[11.5px] font-medium text-[var(--nle-muted)] transition-[border-color,color,transform] duration-[var(--t-fast)] hover:border-[var(--nle-line-strong)] hover:text-[var(--nle-text)] active:scale-[0.98] disabled:opacity-50"
              >
                {a.label}
              </button>
            ) : (
              <Ghost
                key={a.label}
                type="button"
                onClick={() => runAction(a)}
                disabled={thinking || proposal !== null}
                className="max-w-full px-3 py-1.5 text-left text-[11.5px] disabled:opacity-50"
              >
                {a.label}
              </Ghost>
            )
          ))}
        </div>

        {/* The field grows with what you write.
            It was `rows={1}` with no auto-grow, so the second line of any real
            sentence scrolled out of sight the moment it wrapped — you could not
            read back what you had typed. `items-end` also bottom-aligned a
            19px text box against a 24px button, leaving the text sitting a
            couple of pixels low. Both are fixed by giving the field a real
            line box and letting the row centre on it. */}
        <div className={cx("flex items-center gap-2 rounded-[12px] border px-2.5 py-1.5", dark ? "nle-field" : "border-line-input bg-card")}>
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
            aria-label="Write in Project Chat"
            placeholder="What do you want Decode to look at?"
            className={cx("max-h-[112px] min-h-[28px] flex-1 resize-none self-center border-none bg-transparent py-[5px] text-[12.5px] leading-[18px]", dark ? "text-[var(--nle-text)] placeholder:text-[var(--nle-faint)]" : "placeholder:text-t9")}
          />
          <Graphite
            type="button"
            onClick={send}
            aria-label="Send production note"
            className="flex h-7 w-7 flex-none items-center justify-center self-end text-[10px]"
          >
            <PaperPlaneTilt size={13} weight="fill" aria-hidden />
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
          className={cx("mt-2 w-full text-center font-mono text-[9px] tracking-[0.1em] uppercase transition-colors", dark ? "text-[var(--nle-faint)] hover:text-[var(--nle-muted)]" : "text-t9 hover:text-t6")}
        >
          ⌘J to write here
        </button>
      </div>
    </aside>
  );
}

function ProposalLine({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className="grid grid-cols-[46px_minmax(0,1fr)] gap-2">
      <span className={cx("font-mono text-[8.5px] tracking-[0.08em] uppercase", dark ? "text-[var(--nle-faint)]" : "text-t9")}>
        {label}
      </span>
      <span className={cx("text-[10.5px] leading-[1.45]", dark ? "text-[var(--nle-muted)]" : "text-t6")}>{value}</span>
    </div>
  );
}

/**
 * What the room noticed, without being asked.
 *
 * Its own component so it can subscribe to the scenes and the runtime target
 * on its own. The drawer re-renders on every keystroke in the composer, and
 * recomputing four derived observations on each one would be work nobody asked
 * for.
 *
 * Everything here is derived at render from `dur` and the narration. There is
 * nothing to invalidate: retime a scene and the next render says something
 * different about it.
 */
function Noticed({ dark }: { dark: boolean }) {
  const sc = useStudio((s) => s.sc);
  const runtime = useStudio((s) => s.runtime);
  const screen = useStudio((s) => s.screen);
  const tab = useStudio((s) => s.tab);
  const select = useStudio((s) => s.select);

  const found = useMemo(() => observations(sc, runtime), [sc, runtime]);

  // Only where the cut is the thing on screen. On Understanding the creator is
  // reading a brief and has not chosen any of this yet.
  const relevant = screen === "project" && (tab === "plan" || tab === "script" || tab === "edit");
  if (!relevant || found.length === 0) return null;

  return (
    <div className="mb-2.5 flex flex-col gap-1.5">
      {found.map((item) => (
        <button
          key={item.id}
          type="button"
          // Clicking takes you to the scene it is about. The room says where a
          // thing is; the least it can do is take you there.
          onClick={() => {
            const at = /Scene (\d+)/.exec(item.text);
            if (at) select(Number(at[1]) - 1);
          }}
          className={cx(
            "rounded-xl border px-3 py-2 text-left transition-colors duration-[var(--t-fast)]",
            dark
              ? "border-[var(--nle-line)] bg-[var(--nle-panel-raised)] hover:border-[var(--nle-line-strong)]"
              : "border-line-input bg-sunken hover:border-line-strong",
          )}
        >
          <span
            className={cx(
              "block text-[12px] leading-[1.5] font-medium",
              dark ? "text-[var(--nle-text)]" : "text-ink-2",
            )}
          >
            {item.tone === "attention" && (
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            )}
            {item.text}
          </span>
          <span
            className={cx(
              "mt-0.5 block text-[11.5px] leading-[1.5]",
              dark ? "text-[var(--nle-muted)]" : "text-t6",
            )}
          >
            {item.detail}
          </span>
        </button>
      ))}
    </div>
  );
}
