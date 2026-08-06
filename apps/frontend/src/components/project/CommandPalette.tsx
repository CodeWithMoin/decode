"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Copy,
  MessageSquare,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Trash2,
} from "lucide-react";
import { fmt, isLocked, num } from "@/lib/derive";
import { useStudio } from "@/store/studio";
import { cx } from "@/components/ui/primitives";
import type { TabId } from "@/lib/types";

/**
 * ⌘K — do the thing.
 *
 * This replaced a centre-bottom chat bar, and the reason is worth keeping:
 * two different needs were being crammed into one input. "Regenerate the
 * visual for scene four" is a *command* — you already know what you want, and
 * typing a sentence to reach a button that exists is slower, not faster.
 * "This feels rushed" is a *conversation* — you don't know the fix yet.
 *
 * So they split. ⌘K does, ⌘J chats. A palette is precise, fast and
 * transient: it covers the canvas for two seconds and then it is gone, which
 * is why it works on Edit where a permanent bar did not.
 *
 * It also settles the rule this product is built on — everything the AI can do
 * must exist as a control the user can reach — by construction rather than by
 * discipline. The palette *is* the control list. Nothing can appear here that
 * is not already a real action on the store.
 *
 * Every entry that changes something posts a receipt to the Producer thread,
 * naming what moved and what did not. A change you cannot see is a change you
 * cannot trust, whether you clicked it or typed it.
 */

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  run: () => void;
  danger?: boolean;
};

/** Open the palette from a visible control — a shortcut nobody has been told
 *  about is a feature that does not exist, and touch devices have no ⌘ key. */
export const openCommandPalette = () =>
  window.dispatchEvent(new Event("decode:palette"));

const STAGES: { tab: TabId; label: string }[] = [
  { tab: "overview", label: "Understanding" },
  { tab: "plan", label: "Teaching Plan" },
  { tab: "script", label: "Script" },
  { tab: "edit", label: "Edit" },
  { tab: "export", label: "Export" },
];

export function CommandPalette() {
  const { sc, sceneIdx, approvals, playing } = useStudio();
  const setTab = useStudio((s) => s.setTab);
  const lockedNudge = useStudio((s) => s.lockedNudge);
  const applyRegen = useStudio((s) => s.applyRegen);
  const splitScene = useStudio((s) => s.splitScene);
  const mergeScene = useStudio((s) => s.mergeScene);
  const dupScene = useStudio((s) => s.dupScene);
  const removeScene = useStudio((s) => s.removeScene);
  const addScene = useStudio((s) => s.addScene);
  const nudgeDur = useStudio((s) => s.nudgeDur);
  const shortenCurrent = useStudio((s) => s.shortenCurrent);
  const tightenActTwo = useStudio((s) => s.tightenActTwo);
  const setPlaying = useStudio((s) => s.setPlaying);
  const seek = useStudio((s) => s.seek);
  const setThreadOpen = useStudio((s) => s.setThreadOpen);
  const select = useStudio((s) => s.select);
  const ask = useStudio((s) => s.ask);
  const setThinking = useStudio((s) => s.setThinking);
  const say = useStudio((s) => s.say);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  /** Which destructive command is armed. Deleting a scene is the one entry
   *  here with no inverse, and it sits one Enter away from a fuzzy search —
   *  "del" could just as easily have meant something else. So it arms first. */
  const [armed, setArmed] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => {
          if (!v) returnFocusRef.current = document.activeElement as HTMLElement | null;
          return !v;
        });
        setQ("");
        setCursor(0);
      }
    };
    const onOpen = () => {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
      setQ("");
      setCursor(0);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("decode:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("decode:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else returnFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-command-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const scene = sc[sceneIdx];
  const at = `Scene ${num(sceneIdx)}`;

  const receipt = (msg: string, note: string) => {
    setThinking(true);
    const t = window.setTimeout(() => {
      setThinking(false);
      say(msg, note);
    }, 600);
    timers.current.push(t);
  };

  const commands: Cmd[] = useMemo(() => {
    const list: Cmd[] = [];

    /* ---- this scene ---- */
    if (scene) {
      list.push(
        {
          id: "regen-visuals",
          label: "Regenerate visuals",
          hint: at,
          group: "This scene",
          icon: RotateCcw,
          run: () => {
            applyRegen(sceneIdx, "visuals");
            receipt(
              `Redrew the visual for ${at.toLowerCase()}. The narration, its timing and every other scene are exactly as you left them.`,
              `${at} · visual only`,
            );
          },
        },
        {
          id: "regen-voice",
          label: "Regenerate voice",
          hint: at,
          group: "This scene",
          icon: RotateCcw,
          run: () => {
            applyRegen(sceneIdx, "voice");
            receipt(
              `Re-recorded ${at.toLowerCase()}. Same words, same length — nothing downstream shifts.`,
              `${at} · voice only`,
            );
          },
        },
        {
          id: "rewrite",
          label: "Rewrite this scene",
          hint: at,
          group: "This scene",
          icon: RotateCcw,
          run: () => {
            applyRegen(sceneIdx, "scene");
            receipt(
              `Rewrote ${at.toLowerCase()} in plainer language. Its length is unchanged, so the beats around it do not move.`,
              `${at} · rewritten`,
            );
          },
        },
        {
          id: "shorten",
          label: "Make this scene shorter",
          hint: at,
          group: "This scene",
          icon: Minus,
          run: () => {
            shortenCurrent();
            receipt(
              `Tightened ${at.toLowerCase()}. Every other beat keeps its own duration.`,
              `${at} · retimed`,
            );
          },
        },
        {
          id: "plus5",
          label: "Add 5 seconds",
          hint: at,
          group: "This scene",
          icon: Plus,
          run: () => nudgeDur(sceneIdx, 5),
        },
        {
          id: "minus5",
          label: "Remove 5 seconds",
          hint: at,
          group: "This scene",
          icon: Minus,
          run: () => nudgeDur(sceneIdx, -5),
        },
        {
          id: "split",
          label: "Split scene in two",
          hint: at,
          group: "This scene",
          icon: Scissors,
          run: () => splitScene(sceneIdx),
        },
        {
          id: "merge",
          label: "Merge with the next scene",
          hint: at,
          group: "This scene",
          icon: ArrowRight,
          run: () => mergeScene(sceneIdx),
        },
        {
          id: "dup",
          label: "Duplicate scene",
          hint: at,
          group: "This scene",
          icon: Copy,
          run: () => dupScene(sceneIdx),
        },
        {
          id: "remove",
          label: "Delete scene",
          hint: at,
          group: "This scene",
          icon: Trash2,
          danger: true,
          run: () => removeScene(sceneIdx),
        },
      );
    }

    /* ---- the cut ---- */
    list.push(
      {
        id: "add",
        label: "Add a scene at the end",
        group: "The cut",
        icon: Plus,
        run: () => {
          addScene();
          receipt(
            "Added an empty scene at the end. Write it, or tell me what it should cover.",
            "1 scene added",
          );
        },
      },
      {
        id: "tighten",
        label: "Shorten act II by 20 seconds",
        group: "The cut",
        icon: Minus,
        run: () => {
          tightenActTwo();
          receipt(
            "Took 20 seconds out of act II by trimming its longest beats. Acts I and III are untouched.",
            "Act II · −20s",
          );
        },
      },
      {
        id: "play",
        label: playing ? "Pause" : "Play from here",
        group: "The cut",
        icon: Play,
        run: () => setPlaying(!playing),
      },
      {
        id: "top",
        label: "Jump to the start",
        group: "The cut",
        icon: ArrowRight,
        run: () => seek(0),
      },
    );

    /* ---- any scene, not just the selected one ---- */
    sc.forEach((s2, i) => {
      if (i === sceneIdx) return;
      list.push({
        id: `scene-${i}`,
        label: `Scene ${num(i)} · ${s2.title}`,
        hint: fmt(s2.dur),
        group: "Scenes",
        icon: ArrowRight,
        run: () => select(i),
      });
    });

    /* ---- go to ---- */
    for (const s of STAGES) {
      const locked = isLocked(s.tab, approvals);
      list.push({
        id: `go-${s.tab}`,
        label: `Go to ${s.label}`,
        hint: locked ? "Locked" : undefined,
        group: "Go to",
        icon: ArrowRight,
        // A locked stage is explained, never silently ignored — the same
        // contract the rail honours.
        run: () => (locked ? lockedNudge() : setTab(s.tab)),
      });
    }

    list.push({
      id: "ask",
      label: "Open Project Chat",
      hint: "⌘J",
      group: "Go to",
      icon: MessageSquare,
      run: () => setThreadOpen(true),
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, sceneIdx, approvals, playing, at, sc]);

  const results = useMemo(() => {
    const raw = q.trim();
    const needle = raw.toLowerCase();
    if (!needle) return commands;

    const matched = commands.filter(
      (c) =>
        c.label.toLowerCase().includes(needle) ||
        c.group.toLowerCase().includes(needle) ||
        (c.hint ?? "").toLowerCase().includes(needle),
    );

    // Anything you type is a valid thing to say, even when it matches no
    // command. Without this the palette dead-ends on "the pacing feels rushed"
    // — a real note, just not one with a button behind it. Commands rank
    // first because they are exact; the sentence is the fallback.
    const askIt: Cmd = {
      id: "ask-free",
      label: `Send to Project Chat — “${raw}”`,
      hint: "⌘J",
      group: matched.length ? "Or just say it" : "Say it",
      icon: MessageSquare,
      run: () => {
        ask(raw);
        setThreadOpen(true);
        setThinking(true);
        const t = window.setTimeout(() => {
          setThinking(false);
          say(
            "Looking at that now — I'll tell you exactly what I change and what I leave alone before anything moves.",
            scene ? `${at} · noted` : "Noted",
          );
        }, 900);
        timers.current.push(t);
      },
    };

    return [...matched, askIt];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, q, at, scene]);

  useEffect(() => {
    setCursor(0);
    setArmed(null);
  }, [q]);

  useEffect(() => {
    if (!open) setArmed(null);
  }, [open]);

  const runAt = (i: number) => {
    const c = results[i];
    if (!c) return;
    if (c.danger && armed !== c.id) {
      setArmed(c.id);
      return;
    }
    c.run();
    setArmed(null);
    setOpen(false);
    setQ("");
  };

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh]">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="studio-shell relative w-full max-w-[560px] p-[3px] shadow-[var(--shadow-float)]"
      >
        <div className="studio-surface overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line-head px-4 py-3">
          <span className="font-mono text-[10px] tracking-[0.1em] text-t9">
            ⌘K
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setArmed(null);
                setCursor((c) => Math.min(c + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setArmed(null);
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                runAt(cursor);
              }
            }}
            placeholder={
              scene ? `Do something to ${at.toLowerCase()}…` : "Type a command…"
            }
            aria-label="Search commands"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-t8"
          />
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <p className="m-0 px-4 py-6 text-center text-[13px] text-t7">
              Nothing matches &ldquo;{q.trim()}&rdquo;.
            </p>
          )}

          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.icon;
            const active = i === cursor;
            return (
              <div key={c.id}>
                {header && (
                  <div className="px-4 pt-2.5 pb-1 font-mono text-[9px] tracking-[0.13em] text-t9 uppercase">
                    {header}
                  </div>
                )}
                <button
                  type="button"
                  data-command-index={i}
                  onMouseEnter={() => {
                    setCursor(i);
                    if (armed && armed !== c.id) setArmed(null);
                  }}
                  onClick={() => runAt(i)}
                  className={cx(
                    "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13.5px]",
                    active ? "bg-sunken" : "bg-transparent",
                    c.danger ? "text-[#9A3412]" : "text-ink",
                    armed === c.id && "bg-[var(--accent-tint)] font-medium",
                  )}
                >
                  <Icon size={14} strokeWidth={1.7} />
                  <span className="min-w-0 flex-1 truncate">
                    {armed === c.id ? `Delete ${at.toLowerCase()} — press again` : c.label}
                  </span>
                  {c.hint && (
                    <span className="flex-none font-mono text-[9.5px] tracking-[0.08em] text-t9 uppercase">
                      {c.hint}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-line-head bg-sunken px-4 py-2 font-mono text-[9px] tracking-[0.1em] text-t9 uppercase">
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>esc close</span>
          <span className="ml-auto">⌘J to chat</span>
        </div>
        </div>
      </div>
    </div>
  );
}
