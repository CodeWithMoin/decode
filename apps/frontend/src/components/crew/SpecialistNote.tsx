"use client";

import { CrewMark, cx } from "@/components/ui/primitives";
import { SCENE_NOTES } from "@/lib/api";
import { CREW } from "@/lib/crew";
import { useStudio } from "@/store/studio";

/**
 * The crew's open question.
 *
 * On two scenes the Motion Designer does not silently generate — he brings two
 * options and says which one he would pick and why. That disagreement is the
 * point: a crew that only ever agrees with itself is a spinner with names on.
 *
 * The copy lives in `SCENE_NOTES` and is used verbatim; this component only
 * renders it. Picking collapses the whole card into an approved confirmation that
 * states the scope — what is being rebuilt, and what is not.
 *
 * `pickVisual` is what posts the receipt into the Producer thread, so nothing
 * here calls `say()` as well; a second call would post the change twice.
 */

export function SpecialistNote({ pos }: { pos: number }) {
  const note = SCENE_NOTES[pos];
  const picked = useStudio((s) => s.visualPick[pos]);
  const pickVisual = useStudio((s) => s.pickVisual);

  if (!note) return null;

  const c = CREW[note.crew];

  if (picked) {
    return (
      <div
        className="flex items-start gap-[9px] rounded-[14px] px-3 py-2.5"
        style={{ border: "1px solid var(--accent-line)", background: "var(--color-accent-card)" }}
      >
        <div
          className="mt-px flex h-4 w-4 flex-none items-center justify-center rounded-full text-[8px] text-white"
          style={{ background: "var(--accent)" }}
          aria-hidden
        >
          ✓
        </div>
        <div className="text-[11.5px] leading-[1.5] text-t5">
          {c.name} is rebuilding this visual as option {picked}. Nothing else in
          the timeline changes.
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-[14px] bg-card p-[13px] pt-3 shadow-sm"
      style={{
        border: `1px solid ${c.color}59`,
        // Consumed by the option cards' hover border, so the specialist's own
        // colour is what answers the pointer.
        ["--note-ring" as string]: c.color,
      }}
    >
      <div className="mb-1 flex gap-[9px]">
        <CrewMark crew={note.crew} size={22} />
        <div className="min-w-0 flex-1">
          <div className="mb-[3px] text-xs font-semibold">{c.name}</div>
          <p className="m-0 text-xs leading-[1.5] text-t5 pretty">{note.text}</p>
        </div>
      </div>

      {note.options.map((o) => {
        // The preference is stated in the copy; this surfaces it structurally
        // so it survives a glance.
        const isPick = /my pick/i.test(o.desc);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => pickVisual(pos, o.key)}
            className={cx(
              "mt-1.5 flex w-full items-start gap-[9px] rounded-[11px] border px-[11px] py-[9px] text-left",
              "transition-[border-color,background-color] duration-[150ms]",
              "hover:border-[var(--note-ring)] hover:bg-sunken",
              isPick ? "border-line-soft" : "border-line-inner",
            )}
          >
            <div className="flex-none pt-0.5 font-mono text-[9.5px] text-t10">
              {o.key}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-baseline gap-2">
                <div className="min-w-0 flex-1 text-xs font-medium">
                  {o.title}
                </div>
                {isPick && (
                  <div
                    className="flex-none font-mono text-[9px] tracking-[0.12em]"
                    style={{ color: c.color }}
                  >
                    PICK
                  </div>
                )}
              </div>
              <div className="text-[11.5px] leading-[1.45] text-t8">
                {o.desc}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
