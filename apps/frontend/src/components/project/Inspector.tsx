"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise, ArrowCounterClockwise, CaretDown, Check, Diamond } from "@phosphor-icons/react";
import { SpecialistNote } from "@/components/crew/SpecialistNote";
import { Stepper, cx } from "@/components/ui/primitives";
import { fmt, num, starts, wordCount } from "@/lib/derive";
import { changeProjectStage } from "@/lib/project-theme-transition";
import { SCENE_FONTS, hasVisualKeyframe, sceneVisualStyle, sceneVisualStyleAt } from "@/lib/scene-style";
import type { AnimationKind, SceneKeyframeProperty, SceneVisualStyle, StaleKind } from "@/lib/types";
import { useStudio } from "@/store/studio";

const ANIMATIONS: AnimationKind[] = [
  "Fade sequence",
  "Token flow",
  "Equation build",
  "Head split",
  "Wave overlay",
  "Stack build",
  "Chart reveal",
  "Zoom out",
];

const WEIGHTS: SceneVisualStyle["weight"][] = [400, 500, 600, 700];

const STALE_LABEL: Record<StaleKind, string> = {
  visual: "Visual spec",
  assets: "Assets",
  voice: "Voice",
};

/** A scene-local properties panel: generated work stays editable after generation. */
export function Inspector({ inactive = false }: { inactive?: boolean }) {
  const sc = useStudio((s) => s.sc);
  const sceneIdx = useStudio((s) => s.sceneIdx);
  const playhead = useStudio((s) => s.playhead);
  const regen = useStudio((s) => s.regen);
  const staleByScene = useStudio((s) => s.staleByScene);
  const patch = useStudio((s) => s.patch);
  const nudgeDur = useStudio((s) => s.nudgeDur);
  const setVisualParameter = useStudio((s) => s.setVisualParameter);
  const toggleVisualKeyframe = useStudio((s) => s.toggleVisualKeyframe);
  const resetVisualParameter = useStudio((s) => s.resetVisualParameter);
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

  const baseStyle = sceneVisualStyle(scene);
  const sceneStart = starts(sc)[sceneIdx] ?? 0;
  const frameCount = Math.max(1, Math.round(scene.dur * 24));
  const progress = Math.round((Math.max(0, Math.min(scene.dur, playhead - sceneStart)) / scene.dur) * frameCount) / frameCount;
  const style = sceneVisualStyleAt(scene, progress);
  const staleKinds = staleByScene[scene.id] ?? [];

  const updateStyle = (fields: Partial<SceneVisualStyle>) =>
    patch(sceneIdx, { visualStyle: { ...baseStyle, ...fields } });

  const parameterProps = (property: SceneKeyframeProperty) => ({
    value: style[property],
    keyframed: hasVisualKeyframe(scene, property, progress),
    hasKeyframes: (scene.visualKeyframes?.[property]?.length ?? 0) > 0,
    onBeginChange: checkpoint,
    onChange: (value: number) => setVisualParameter(sceneIdx, property, value),
    onToggleKeyframe: () => toggleVisualKeyframe(sceneIdx, property),
    onReset: () => resetVisualParameter(sceneIdx, property),
  });

  /**
   * Rebuild part of this scene.
   *
   * All three scopes live here now. Visuals-only and voice-only used to exist
   * only in the command palette, and they are the two that matter most for the
   * stale rule — after a narration edit you usually want the voice rebuilt and
   * the visuals left alone. Deleting the palette without rehoming them would
   * have quietly removed the ability to do that.
   *
   * Never a bare spinner: the canvas gets a label naming which part of which
   * scene is being rebuilt, and the receipt afterwards names what was *not*
   * touched.
   */
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
        "flex min-h-[520px] w-full flex-none flex-col overflow-hidden border-l border-[var(--nle-line)] bg-[#111111] text-[var(--nle-text)] shadow-[-14px_0_34px_rgb(0_0_0_/_0.2)] lg:min-h-0 lg:w-[344px] lg:min-w-[304px]",
        inactive && "pointer-events-none",
      )}
    >
      <div className="rail-y min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-[var(--nle-line)] p-3">
          <Label>Name</Label>
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
            className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-[7px] bg-[#2A2A2A] px-3 text-[12px] font-medium text-[var(--nle-text)] transition-[background-color,transform] duration-[var(--t-fast)] hover:bg-[#343434] active:scale-[0.99] disabled:opacity-50"
          >
            <ArrowClockwise size={14} weight="regular" aria-hidden />
            {regen ? "Regenerating" : "Regenerate"}
          </button>

          {/* The narrower scopes, which is what an edit usually needs. Rebuilding
              the whole scene when only the words changed throws away a visual
              the creator may have already approved. */}
          <div className="mt-1.5 flex gap-1.5">
            {(["visuals", "voice"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => regenerate(kind)}
                disabled={regen !== null}
                className="flex h-7 flex-1 items-center justify-center rounded-[6px] bg-[#191919] px-2 text-[10px] text-[var(--nle-muted)] transition-[background-color,color] duration-[var(--t-fast)] hover:bg-[#222222] hover:text-[var(--nle-text)] disabled:opacity-50"
              >
                {kind === "visuals" ? "Visuals only" : "Voice only"}
              </button>
            ))}
          </div>

          {staleKinds.length > 0 && (
            <p className="mt-2 font-mono text-[9px] leading-[1.5] tracking-[0.05em] text-[var(--nle-faint)] uppercase">
              {staleKinds.map((kind) => STALE_LABEL[kind]).join(" · ")} pending for this scene
            </p>
          )}
        </section>

        <details open className="group border-b border-[var(--nle-line)]">
          <summary className={summaryClass}>
            <span>Controls</span>
            <CaretDown size={13} className="transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="grid gap-1.5 px-3 pb-3">
            <TextControl label="Caption" value={scene.caption} onChange={(caption) => patch(sceneIdx, { caption })} />
            <TextControl
              label="Labels"
              value={scene.viz.join(" · ")}
              onChange={(value) => patch(sceneIdx, { viz: value.split(/[·,]/).map((item) => item.trim()).filter(Boolean) })}
            />
            <SelectControl
              className="w-[178px]"
              label="Motion"
              value={scene.anim}
              options={ANIMATIONS}
              onChange={(anim) => patch(sceneIdx, { anim: anim as AnimationKind })}
              inline
            />
            <button
              type="button"
              onClick={() => changeProjectStage("edit", "script", () => setTab("script"))}
              className={`${controlRowClass} justify-between text-left text-[12px] text-[var(--nle-muted)] hover:text-[var(--nle-text)]`}
            >
              <span>Narration</span>
              <span className="font-mono text-[9px]">{wordCount(scene.narration)} words · Edit in Script →</span>
            </button>
          </div>
        </details>

        <InspectorGroup title="Typography">
          <SelectControl label="Font" value={style.font} options={SCENE_FONTS} onChange={(font) => updateStyle({ font: font as SceneVisualStyle["font"] })} inline />
          <SelectControl label="Weight" value={String(style.weight)} options={WEIGHTS.map(String)} onChange={(weight) => updateStyle({ weight: Number(weight) as SceneVisualStyle["weight"] })} inline />
          <ScrubbyControl label="Size" min={12} max={72} step={1} suffix="px" {...parameterProps("size")} />
        </InspectorGroup>

        <InspectorGroup title="Colors">
          <ColorControl label="Text" value={style.textColor} onChange={(textColor) => updateStyle({ textColor })} />
          <ColorControl label="Secondary" value={style.secondaryColor} onChange={(secondaryColor) => updateStyle({ secondaryColor })} />
          <ColorControl label="Accent" value={style.accentColor} onChange={(accentColor) => updateStyle({ accentColor })} />
          <ColorControl label="Background" value={style.backgroundColor} onChange={(backgroundColor) => updateStyle({ backgroundColor })} />
        </InspectorGroup>

        <InspectorGroup title="Layout">
          <AlignmentControl x={style.x} onChange={(x) => { checkpoint(); setVisualParameter(sceneIdx, "x", x); }} />
          <ScrubbyControl label="Position X" min={-100} max={100} step={1} suffix="" signed {...parameterProps("x")} />
          <ScrubbyControl label="Position Y" min={-100} max={100} step={1} suffix="" signed {...parameterProps("y")} />
          <ScrubbyControl label="Scale" min={50} max={150} step={1} suffix="%" {...parameterProps("scale")} />
        </InspectorGroup>

        <InspectorGroup title="Timing">
          <div className="w-[150px]">
            <Label>Duration</Label>
            <Stepper value={fmt(scene.dur)} onMinus={() => nudgeDur(sceneIdx, -5)} onPlus={() => nudgeDur(sceneIdx, 5)} size="lg" label="Scene duration" dark />
          </div>
          <p className="text-[10.5px] leading-[1.5] text-[var(--nle-faint)]">Narration timing follows the scene duration automatically.</p>
        </InspectorGroup>

        <InspectorGroup title="Effects">
          <ScrubbyControl label="Opacity" min={10} max={100} step={1} suffix="%" {...parameterProps("opacity")} />
          <ScrubbyControl label="Blur" min={0} max={12} step={0.5} suffix="px" {...parameterProps("blur")} />
        </InspectorGroup>

        <div className="border-t border-[var(--nle-line)] p-3">
          <SpecialistNote pos={sceneIdx} dark />
        </div>
      </div>
    </aside>
  );
}

function InspectorGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b border-[var(--nle-line)]">
      <summary className={summaryClass}>
        <span>{title}</span>
        <CaretDown size={13} className="transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-1.5 px-3 pb-3">{children}</div>
    </details>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 font-mono text-[8.5px] tracking-[0.12em] text-[var(--nle-faint)] uppercase">{children}</div>;
}

function TextControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={controlRowClass}>
      <span className="flex-none text-[12px] text-[var(--nle-muted)]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right text-[11.5px] text-[var(--nle-text)] outline-none placeholder:text-[var(--nle-faint)]" />
    </label>
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
      {!inline && <Label>{label}</Label>}
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

function AlignmentControl({ x, onChange }: { x: number; onChange: (x: number) => void }) {
  const active = x < -15 ? "left" : x > 15 ? "right" : "center";
  const options = [
    { id: "left", label: "Align left", x: -30 },
    { id: "center", label: "Align center", x: 0 },
    { id: "right", label: "Align right", x: 30 },
  ] as const;

  return (
    <div>
      <div className="mb-1.5 text-[11px] text-[var(--nle-muted)]">Alignment</div>
      <div role="group" aria-label="Horizontal alignment" className="grid w-[132px] grid-cols-3 gap-1 rounded-[8px] bg-[#161616] p-1">
        {options.map((option) => {
          const selected = option.id === active;
          return (
            <button
              key={option.id}
              type="button"
              aria-label={option.label}
              aria-pressed={selected}
              onClick={() => { if (!selected) onChange(option.x); }}
              className={`grid h-8 place-items-center rounded-[6px] transition-[background-color,color,box-shadow] ${selected ? "bg-[#2A2A2A] text-[var(--nle-text)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]" : "text-[var(--nle-faint)] hover:bg-[#202020] hover:text-[var(--nle-muted)]"}`}
            >
              <AlignmentGlyph alignment={option.id} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AlignmentGlyph({ alignment }: { alignment: "left" | "center" | "right" }) {
  const align = alignment === "left" ? "items-start" : alignment === "right" ? "items-end" : "items-center";
  return (
    <span aria-hidden className={`flex h-4 w-5 flex-col justify-center gap-[3px] ${align}`}>
      <span className="h-[2px] w-5 rounded-full bg-current" />
      <span className="h-[2px] w-3 rounded-full bg-current" />
      <span className="h-[2px] w-4 rounded-full bg-current" />
    </span>
  );
}

function ScrubbyControl({ label, value, min, max, step, suffix, onChange, onBeginChange, keyframed, hasKeyframes, onToggleKeyframe, onReset, signed = false }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void; onBeginChange: () => void; keyframed: boolean; hasKeyframes: boolean; onToggleKeyframe: () => void; onReset: () => void; signed?: boolean }) {
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
      className="group flex h-10 w-full cursor-ew-resize touch-pan-y items-center gap-2 rounded-[5px] px-1 outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-[var(--nle-line-strong)]"
    >
      <span className="w-[76px] flex-none text-right text-[11.5px] text-[var(--nle-muted)] transition-colors group-hover:text-[var(--nle-text)]">{label}</span>
      <span className="relative h-1 min-w-0 flex-1 overflow-visible rounded-full bg-[#090909]" aria-hidden>
        <span className="block h-full rounded-full bg-[#484848]" style={{ width: `${progress}%` }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 rounded-full border border-[#111] bg-[#989898] shadow-[0_1px_2px_rgb(0_0_0_/_0.6)]" style={{ left: `${progress}%`, transform: "translate(-50%, -50%)" }} />
      </span>
      <span className="flex h-8 w-[68px] flex-none items-center justify-end gap-1 rounded-[4px] border border-[#080808] bg-[#111111] px-2 tabular-nums shadow-[inset_0_1px_0_rgb(255_255_255_/_0.035)]">
        <span className="text-[12px] text-[var(--nle-text)]">{displayValue}</span>
        <span className="font-mono text-[8px] text-[var(--nle-faint)]">{suffix}</span>
      </span>
      <button
        type="button"
        aria-label={`${keyframed ? "Remove" : "Add"} ${label} keyframe at the playhead`}
        aria-pressed={keyframed}
        title={keyframed ? "Remove keyframe" : "Add keyframe"}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onToggleKeyframe}
        className={`grid h-7 w-7 flex-none place-items-center rounded-[4px] transition-colors hover:bg-white/[0.05] ${keyframed ? "text-accent" : hasKeyframes ? "text-[var(--nle-text)]" : "text-[var(--nle-faint)]"}`}
      >
        <Diamond size={13} weight={keyframed ? "fill" : "regular"} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Reset ${label}`}
        title={`Reset ${label}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onReset}
        className="grid h-7 w-7 flex-none place-items-center rounded-[4px] text-[var(--nle-faint)] transition-colors hover:bg-white/[0.05] hover:text-[var(--nle-text)]"
      >
        <ArrowCounterClockwise size={15} aria-hidden />
      </button>
    </div>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const pickerValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  const parsed = hexToHsv(pickerValue);
  const [rememberedHue, setRememberedHue] = useState(parsed.h);
  const hue = parsed.s === 0 ? rememberedHue : parsed.h;

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
      if (trigger.current) setPosition(floatingPosition(trigger.current, 280));
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          if (!open && trigger.current) setPosition(floatingPosition(trigger.current, 280));
          setOpen((current) => !current);
        }}
        aria-label={`Choose ${label.toLowerCase()} color`}
        aria-expanded={open}
        className={`${controlRowClass} w-full text-left transition-colors hover:bg-[#202020]`}
      >
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--nle-muted)]">{label}</span>
        <span className="h-6 w-6 flex-none rounded-[5px] border border-[var(--nle-line-strong)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12)]" style={{ backgroundColor: pickerValue }} aria-hidden />
        <span className="w-[60px] text-right font-mono text-[9px] uppercase text-[var(--nle-faint)]">{value}</span>
      </button>
      {open && position && createPortal(
        <div ref={popover} className="fixed z-[220] rounded-[10px] border border-[var(--nle-line-strong)] bg-[#202020] p-3 shadow-[0_18px_42px_rgb(0_0_0_/_0.65)]" style={{ left: position.left, top: position.top, width: position.width }}>
          <div className="mb-2 font-mono text-[8.5px] tracking-[0.12em] text-[var(--nle-faint)] uppercase">{label} color</div>
          <ColorArea
            label={label}
            hue={hue}
            saturation={parsed.s}
            brightness={parsed.v}
            onChange={(saturation, brightness) => onChange(hsvToHex(hue, saturation, brightness))}
          />
          <HueSlider
            label={label}
            hue={hue}
            onChange={(nextHue) => {
              setRememberedHue(nextHue);
              onChange(hsvToHex(nextHue, parsed.s, parsed.v));
            }}
          />
          <label className="nle-field mt-3 flex h-9 items-center gap-2 rounded-[7px] bg-[#151515] px-2.5">
            <span className="font-mono text-[8.5px] tracking-[0.08em] text-[var(--nle-faint)] uppercase">Hex</span>
            <input aria-label={`${label} hex value`} value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className="min-w-0 flex-1 bg-transparent text-right font-mono text-[10.5px] uppercase text-[var(--nle-text)] outline-none" spellCheck={false} />
          </label>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ColorArea({ label, hue, saturation, brightness, onChange }: { label: string; hue: number; saturation: number; brightness: number; onChange: (saturation: number, brightness: number) => void }) {
  const beginDrag = useMouseDrag("crosshair", (clientX, clientY, rect) => {
    const nextSaturation = clamp01((clientX - rect.left) / rect.width);
    const nextBrightness = clamp01(1 - (clientY - rect.top) / rect.height);
    onChange(nextSaturation, nextBrightness);
  });

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${label} saturation and brightness`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(brightness * 100)}
      aria-valuetext={`${Math.round(saturation * 100)}% saturation, ${Math.round(brightness * 100)}% brightness`}
      onMouseDown={beginDrag}
      onKeyDown={(event) => {
        const amount = event.shiftKey ? 0.1 : 0.02;
        if (event.key === "ArrowLeft") onChange(clamp01(saturation - amount), brightness);
        else if (event.key === "ArrowRight") onChange(clamp01(saturation + amount), brightness);
        else if (event.key === "ArrowDown") onChange(saturation, clamp01(brightness - amount));
        else if (event.key === "ArrowUp") onChange(saturation, clamp01(brightness + amount));
        else return;
        event.preventDefault();
      }}
      className="relative h-36 cursor-crosshair overflow-hidden rounded-[8px] outline-none focus-visible:ring-1 focus-visible:ring-[var(--nle-line-strong)]"
      style={{
        backgroundColor: `hsl(${hue} 100% 50%)`,
        backgroundImage: "linear-gradient(to top, #000 0%, transparent 100%), linear-gradient(to right, #fff 0%, transparent 100%)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute h-3.5 w-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0_/_0.75),0_2px_5px_rgb(0_0_0_/_0.45)]"
        style={{ left: `${saturation * 100}%`, top: `${(1 - brightness) * 100}%`, transform: "translate(-50%, -50%)" }}
      />
    </div>
  );
}

function HueSlider({ label, hue, onChange }: { label: string; hue: number; onChange: (hue: number) => void }) {
  const beginDrag = useMouseDrag("ew-resize", (clientX, _clientY, rect) => {
    onChange(Math.round(clamp01((clientX - rect.left) / rect.width) * 359));
  });

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${label} hue`}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(hue)}
      onMouseDown={beginDrag}
      onKeyDown={(event) => {
        const amount = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") onChange((hue - amount + 360) % 360);
        else if (event.key === "ArrowRight" || event.key === "ArrowUp") onChange((hue + amount) % 360);
        else return;
        event.preventDefault();
      }}
      className="relative mt-3 h-3 cursor-ew-resize rounded-full outline-none focus-visible:ring-1 focus-visible:ring-[var(--nle-line-strong)]"
      style={{ background: "linear-gradient(90deg,#F00,#FF0,#0F0,#0FF,#00F,#F0F,#F00)" }}
    >
      <span aria-hidden className="pointer-events-none absolute top-1/2 h-4 w-2.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0_/_0.7)]" style={{ left: `${(hue / 359) * 100}%`, transform: "translate(-50%, -50%)" }} />
    </div>
  );
}

function useMouseDrag(cursor: string, onMove: (clientX: number, clientY: number, rect: DOMRect) => void) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  return (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanupRef.current?.();
    const rect = event.currentTarget.getBoundingClientRect();
    const previous = dragStyles();
    const move = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      onMove(moveEvent.clientX, moveEvent.clientY, rect);
    };
    const finish = () => cleanup();
    const cleanup = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      applyDragStyles(previous);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    applyDragStyles({ cursor, userSelect: "none" });
    onMove(event.clientX, event.clientY, rect);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
  };
}

const fieldClass = "nle-field h-9 w-full rounded-[7px] bg-[#202020] px-2.5 text-[12px] text-[var(--nle-text)] outline-none";
const controlRowClass = "flex h-[34px] items-center gap-2 rounded-[7px] bg-[#1B1B1B] px-2.5";
const summaryClass = "flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-[12.5px] font-semibold text-[var(--nle-text)] [&::-webkit-details-marker]:hidden";

/**
 * The cursor and selection lock a scrub holds on <body>.
 *
 * Module scope on purpose. Setting `document.body.style` from inside a JSX
 * handler trips `react-hooks/immutability` — the React Compiler treats values
 * reached from render scope as frozen, and cannot tell that this one is a DOM
 * side effect rather than state being mutated. Out here there is no render
 * scope to reason about, and the rule stays on for the cases it is right about.
 */
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

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function hexToHsv(hex: string) {
  const raw = hex.replace("#", "");
  const red = Number.parseInt(raw.slice(0, 2), 16) / 255;
  const green = Number.parseInt(raw.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(hue: number, saturation: number, brightness: number) {
  const chroma = brightness * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, x, 0]
    : segment < 2 ? [x, chroma, 0]
      : segment < 3 ? [0, chroma, x]
        : segment < 4 ? [0, x, chroma]
          : segment < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = brightness - chroma;
  const channel = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
