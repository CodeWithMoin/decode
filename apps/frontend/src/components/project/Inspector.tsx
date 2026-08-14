"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise, ArrowCounterClockwise, CaretDown, Check, Diamond } from "@phosphor-icons/react";
import { Stepper, cx } from "@/components/ui/primitives";
import { fmt, num, wordCount } from "@/lib/derive";
import { changeProjectStage } from "@/lib/project-theme-transition";
import { SCENE_FONTS } from "@/lib/scene-style";
import type { SceneVisualStyle, StaleKind } from "@/lib/types";
import { useStudio } from "@/store/studio";

const STALE_LABEL: Record<StaleKind, string> = {
  visual: "Visual spec",
  assets: "Assets",
  voice: "Voice",
};

export function Inspector({ inactive = false }: { inactive?: boolean }) {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const regen = useStudio((s) => s.regen);
  const staleByScene = useStudio((s) => s.staleByScene);
  const controlValues = useStudio((s) => s.controlValues);
  const setControlValue = useStudio((s) => s.setControlValue);
  const patch = useStudio((s) => s.patch);
  const nudgeDur = useStudio((s) => s.nudgeDur);
  const setClipFade = useStudio((s) => s.setClipFade);
  const checkpoint = useStudio((s) => s._pushHistory);
  const setTab = useStudio((s) => s.setTab);
  const setRegen = useStudio((s) => s.setRegen);
  const applyRegen = useStudio((s) => s.applyRegen);
  const say = useStudio((s) => s.say);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const scene = sc[sceneIdx];
  if (!scene) return null;

  const style = { ...scene.visualStyle, font: scene.visualStyle?.font ?? "Space Grotesk" };
  const staleKinds = staleByScene[scene.id] ?? [];

  const updateStyle = (fields: Partial<SceneVisualStyle>) =>
    patch(sceneIdx, { visualStyle: { ...scene.visualStyle, ...fields } });

  const regenerate = (kind: "scene" | "visuals" | "voice") => {
    if (regen) return;
    const n = num(sceneIdx);
    const working = {
      visuals: `Regenerating the visual design for scene ${n}…`,
      voice: `Re-recording scene ${n}…`,
      scene: `Redrafting scene ${n}…`,
    }[kind];
    const done = {
      visuals: [
        `Regenerated the visual design for scene ${n}. Narration, voice, timing and every other scene stayed unchanged.`,
        `Scene ${n} · visual regenerated`,
      ],
      voice: [
        `Re-recorded scene ${n}. Same words, same length — nothing downstream shifted.`,
        `Scene ${n} · voice regenerated`,
      ],
      scene: [
        `Rebuilt scene ${n} end to end. Only this scene was touched; every other scene is as you left it.`,
        `Scene ${n} · scene rebuilt`,
      ],
    }[kind];

    setRegen(working);
    timer.current = setTimeout(() => {
      applyRegen(sceneIdx, kind);
      say(done[0], done[1]);
    }, 900);
  };

  return (
    <aside
      inert={inactive}
      aria-hidden={inactive || undefined}
      aria-label="Scene settings"
      className={cx(
        "flex min-h-[520px] w-full flex-none flex-col overflow-hidden border-l border-white/[0.06] bg-[#0B0B0B] text-[var(--nle-text)] shadow-[inset_1px_0_0_rgb(255_255_255_/_0.015)] lg:min-h-0 lg:w-[344px] lg:min-w-[304px]",
        inactive && "pointer-events-none",
      )}
    >
      <div className="rail-y min-h-0 flex-1 overflow-y-auto">
        <section className="px-3.5 pt-4 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex-none font-mono text-[10px] tabular-nums text-[var(--nle-faint)]">{num(sceneIdx)}</span>
            <input
              aria-label="Scene name"
              value={scene.title}
              onChange={(event) => patch(sceneIdx, { title: event.target.value })}
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => regenerate("scene")}
              disabled={regen !== null}
              aria-label="Regenerate selected scene"
              title="Regenerate"
              className="grid h-9 w-8 flex-none place-items-center rounded-[6px] text-[var(--nle-faint)] transition-[background-color,color] duration-[var(--t-fast)] hover:bg-white/[0.06] hover:text-[var(--nle-muted)] active:scale-[0.96] disabled:opacity-40"
            >
              <ArrowClockwise size={14} weight="regular" aria-hidden />
            </button>
          </div>
          {staleKinds.length > 0 && (
            <p className="mt-2 font-mono text-[8.5px] leading-[1.5] tracking-[0.05em] text-[var(--accent-lit)] uppercase">
              {staleKinds.map((kind) => STALE_LABEL[kind]).join(" · ")} pending
            </p>
          )}
        </section>

        <div className="border-t border-white/[0.06] py-4">
          <div className="grid gap-3 px-3.5">
            <ClipFadeControl label="Fade in" value={scene.fadeIn ?? 0} max={Math.max(0, scene.dur - (scene.fadeOut ?? 0))} onChange={(value) => setClipFade(sceneIdx, "in", value)} onBeginChange={checkpoint} />
            <ClipFadeControl label="Fade out" value={scene.fadeOut ?? 0} max={Math.max(0, scene.dur - (scene.fadeIn ?? 0))} onChange={(value) => setClipFade(sceneIdx, "out", value)} onBeginChange={checkpoint} />
            <SelectControl label="Font" value={style.font} options={SCENE_FONTS} onChange={(font) => updateStyle({ font: font as SceneVisualStyle["font"] })} inline />
            <Stepper value={fmt(scene.dur)} onMinus={() => nudgeDur(sceneIdx, -5)} onPlus={() => nudgeDur(sceneIdx, 5)} size="lg" label="Duration" dark />
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-3.5 py-4">
          <button
            type="button"
            onClick={() => changeProjectStage("edit", "script", () => setTab("script"))}
            className="flex w-full items-center justify-between rounded-[5px] px-2 py-2 text-[12px] text-[var(--nle-muted)] transition-colors duration-[var(--t-fast)] hover:bg-white/[0.03] hover:text-[var(--nle-text)]"
          >
            <span>Edit narration in Script →</span>
            <span className="font-mono text-[9px] text-[var(--nle-faint)]">{wordCount(scene.narration)} words</span>
          </button>
          <div className="mt-3 flex gap-2">
            {(["visuals", "voice"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => regenerate(kind)}
                disabled={regen !== null}
                className="flex-1 rounded-[6px] border border-white/[0.06] bg-[#111111] px-3 py-2 text-center text-[11.5px] font-medium text-[var(--nle-muted)] transition-[background-color,border-color,color] duration-[var(--t-fast)] hover:border-white/[0.1] hover:bg-[#181818] hover:text-[var(--nle-text)] active:scale-[0.98] disabled:opacity-40"
              >
                {kind === "visuals" ? "Regenerate visual" : "Regenerate voice"}
              </button>
            ))}
          </div>
        </div>

        {scene.componentSource && scene.controls && scene.controls.length > 0 && (
          <div className="border-t border-white/[0.06] px-3.5 py-4">
            <div className="mb-1 font-mono text-[8.5px] tracking-[0.12em] text-[var(--nle-faint)] uppercase">
              Controls
            </div>
            <div className="grid gap-3">
              {scene.controls.map((control) => {
                const value = controlValues[scene.id]?.[control.name] ?? control.default;
                if (control.type === "number") {
                  const numeric = typeof value === "number" ? value : Number(value) || 0;
                  return (
                    <ScrubbyControl
                      key={control.name}
                      label={control.label}
                      value={numeric}
                      min={control.minimum ?? 0}
                      max={control.maximum ?? 100}
                      step={control.step ?? 1}
                      suffix=""
                      onBeginChange={checkpoint}
                      onChange={(next) => setControlValue(scene.id, control.name, next)}
                      keyframed={false}
                      hasKeyframes={false}
                      onToggleKeyframe={() => undefined}
                      onReset={() => setControlValue(scene.id, control.name, control.default)}
                      keyframable={false}
                    />
                  );
                }
                if (control.type === "boolean") {
                  const on = Boolean(value);
                  return (
                    <label key={control.name} className={`${controlRowClass} justify-between`}>
                      <span className="text-[12px] text-[var(--nle-muted)]">{control.label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={control.label}
                        onClick={() => setControlValue(scene.id, control.name, !on)}
                        className={`relative h-[20px] w-[34px] flex-none rounded-full transition-colors duration-150 ${on ? "bg-[var(--accent)]" : "bg-[#242424]"}`}
                      >
                        <span
                          className="absolute top-[2px] left-[2px] block h-[16px] w-[16px] rounded-full bg-white transition-transform duration-150"
                          style={{ transform: on ? "translateX(14px)" : "translateX(0)" }}
                        />
                      </button>
                    </label>
                  );
                }
                if (control.type === "color") {
                  return (
                    <label key={control.name} className={`${controlRowClass} justify-between`}>
                      <span className="text-[12px] text-[var(--nle-muted)]">{control.label}</span>
                      <input
                        aria-label={control.label}
                        type="color"
                        value={String(value)}
                        onChange={(event) => setControlValue(scene.id, control.name, event.target.value)}
                        className="h-7 w-9 flex-none cursor-pointer rounded-[5px] border border-white/[0.08] bg-transparent p-0"
                      />
                    </label>
                  );
                }
                return (
                  <label key={control.name} className="grid gap-1">
                    <span className="font-mono text-[8.5px] tracking-[0.12em] text-[var(--nle-faint)] uppercase">
                      {control.label}
                    </span>
                    <input
                      aria-label={control.label}
                      value={String(value)}
                      onChange={(event) => setControlValue(scene.id, control.name, event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ClipFadeControl({ label, value, max, onChange, onBeginChange }: { label: string; value: number; max: number; onChange: (value: number) => void; onBeginChange: () => void }) {
  return (
    <ScrubbyControl
      label={label}
      value={value}
      min={0}
      max={max}
      step={0.25}
      suffix="s"
      onBeginChange={onBeginChange}
      onChange={onChange}
      keyframed={false}
      hasKeyframes={false}
      onToggleKeyframe={() => undefined}
      onReset={() => { onBeginChange(); onChange(0); }}
      keyframable={false}
    />
  );
}

function SelectControl({ label, value, options, onChange, inline = false, className = "" }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; inline?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    const reposition = () => {
      if (trigger.current) setPosition(floatingPosition(trigger.current, Math.min(300, options.length * 36 + 12)));
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, options.length]);

  return (
    <div ref={root} className={`relative ${className}`}>
      {!inline && <div className="font-mono text-[8.5px] tracking-[0.12em] text-[var(--nle-faint)] uppercase">{label}</div>}
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (!open && trigger.current) setPosition(floatingPosition(trigger.current, Math.min(300, options.length * 36 + 12)));
          setOpen((current) => !current);
        }}
        className={`${inline ? `${controlRowClass} w-full` : fieldClass} flex items-center justify-between gap-3 text-left`}
      >
        {inline && <span className="flex-none text-[12px] text-[var(--nle-muted)]">{label}</span>}
        <span className={`min-w-0 flex-1 truncate ${inline ? "text-right text-[11.5px]" : ""}`}>{value}</span>
        <CaretDown size={13} className={`flex-none text-[var(--nle-faint)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && position && createPortal(
        <div ref={popover} id={listId} role="listbox" aria-label={`${label} options`} className="fixed z-[220] overflow-y-auto rounded-[9px] border border-[var(--nle-line-strong)] bg-[#202020] p-1.5 shadow-[0_18px_42px_rgb(0_0_0_/_0.65)]" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-[6px] px-2.5 text-left text-[11px] transition-colors ${selected ? "bg-white/[0.07] text-[var(--nle-text)]" : "text-[var(--nle-muted)] hover:bg-white/[0.04] hover:text-[var(--nle-text)]"}`}
              >
                <span className="truncate">{option}</span>
                {selected && <Check size={12} weight="bold" className="text-[var(--accent)]" aria-hidden />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

function ScrubbyControl({ label, value, min, max, step, suffix, onChange, onBeginChange, keyframed, hasKeyframes, onToggleKeyframe, onReset, signed = false, keyframable = true }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void; onBeginChange: () => void; keyframed: boolean; hasKeyframes: boolean; onToggleKeyframe: () => void; onReset: () => void; signed?: boolean; keyframable?: boolean }) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  const scrubCleanup = useRef<(() => void) | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const precision = step < 1 ? String(step).split(".")[1]?.length ?? 0 : 0;
  const displayValue = `${signed && value > 0 ? "+" : ""}${value.toFixed(precision)}`;
  const normalize = (next: number) => Number(clamp(next).toFixed(precision));
  const progress = ((value - min) / (max - min)) * 100;

  useEffect(() => () => scrubCleanup.current?.(), []);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value}${suffix}`}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        onBeginChange();
        scrubCleanup.current?.();
        drag.current = { x: event.clientX, value };
        const previous = dragStyles();
        const move = (moveEvent: MouseEvent) => {
          if (!drag.current) return;
          const increments = Math.round((moveEvent.clientX - drag.current.x) / 4);
          onChange(normalize(drag.current.value + increments * step));
        };
        const finish = () => cleanup();
        const cleanup = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", finish);
          applyDragStyles(previous);
          drag.current = null;
          scrubCleanup.current = null;
        };
        scrubCleanup.current = cleanup;
        applyDragStyles({ cursor: "ew-resize", userSelect: "none" });
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", finish);
      }}
      onKeyDown={(event) => {
        const amount = step * (event.shiftKey ? 10 : 1);
        let next: number | null = null;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = normalize(value - amount);
        else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = normalize(value + amount);
        else if (event.key === "Home") next = min;
        else if (event.key === "End") next = max;
        if (next === null || next === value) return;
        onBeginChange();
        onChange(next);
        event.preventDefault();
      }}
      className="group flex h-9 w-full cursor-ew-resize touch-pan-y items-center gap-2 px-1 outline-none focus-visible:bg-white/[0.03]"
    >
      <span className="w-[74px] flex-none text-right text-[11px] text-[var(--nle-faint)]">{label}</span>
      <span className="relative h-[3px] min-w-0 flex-1 overflow-visible rounded-full bg-[#1C1C1C]" aria-hidden>
        <span className="block h-full rounded-full bg-[#4E4E4E]" style={{ width: `${progress}%` }} />
        <span className="absolute top-1/2 hidden h-3 w-3 rounded-full border border-[#282828] bg-[#B0B0B0] shadow-[0_0_0_1px_rgb(0_0_0_/_0.5)] group-hover:block" style={{ left: `${progress}%`, transform: "translate(-50%, -50%)" }} />
      </span>
      <span className="flex h-7 w-[72px] flex-none items-center justify-end gap-1 rounded-[4px] bg-[#131313] px-2 tabular-nums shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.03)]">
        <span className="text-[11.5px] text-[var(--nle-text)]">{displayValue}</span>
        <span className="font-mono text-[7.5px] text-[var(--nle-faint)]">{suffix}</span>
      </span>
      {keyframable ? (
        <button
          type="button"
          aria-label={`${keyframed ? "Remove" : "Add"} ${label} keyframe at the playhead`}
          aria-pressed={keyframed}
          title={keyframed ? "Remove keyframe" : "Add keyframe"}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onToggleKeyframe}
          className={`grid h-6 w-6 flex-none place-items-center rounded-[4px] transition-colors hover:bg-white/[0.05] ${keyframed ? "text-accent" : hasKeyframes ? "text-[var(--nle-text)]" : "text-[var(--nle-faint)]"}`}
        >
          <Diamond size={11} weight={keyframed ? "fill" : "regular"} aria-hidden />
        </button>
      ) : (
        <span className="h-6 w-6 flex-none" aria-hidden />
      )}
      <button
        type="button"
        aria-label={`Reset ${label}`}
        title={`Reset ${label}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onReset}
        className="grid h-6 w-6 flex-none place-items-center rounded-[4px] text-[var(--nle-faint)] transition-colors hover:bg-white/[0.05] hover:text-[var(--nle-muted)]"
      >
        <ArrowCounterClockwise size={13} aria-hidden />
      </button>
    </div>
  );
}

const fieldClass = "nle-field h-9 w-full rounded-[7px] bg-[#151515] px-2.5 text-[12.5px] text-[var(--nle-text)] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)] outline-none transition-[background-color,box-shadow] duration-[var(--t-fast)] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.07)] focus-within:shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.12)]";
const controlRowClass = "flex h-[34px] items-center gap-2 px-1";

type DragStyles = { cursor: string; userSelect: string };

function dragStyles(): DragStyles {
  return {
    cursor: document.body.style.cursor,
    userSelect: document.body.style.userSelect,
  };
}

function applyDragStyles({ cursor, userSelect }: DragStyles) {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = userSelect;
}

type FloatingPosition = { left: number; top: number; width: number; maxHeight: number };

function floatingPosition(trigger: HTMLElement, desiredHeight: number): FloatingPosition {
  const rect = trigger.getBoundingClientRect();
  const margin = 10;
  const gap = 5;
  const maxHeight = Math.min(desiredHeight, window.innerHeight - margin * 2);
  const top = rect.bottom + gap + maxHeight <= window.innerHeight - margin
    ? rect.bottom + gap
    : Math.max(margin, rect.top - gap - maxHeight);
  const width = rect.width;
  const left = Math.min(window.innerWidth - margin - width, Math.max(margin, rect.left));
  return { left, top, width, maxHeight };
}
