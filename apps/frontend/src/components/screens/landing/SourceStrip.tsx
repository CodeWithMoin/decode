"use client";

/**
 * What you can hand it.
 *
 * Two earlier versions of this strip were wrong in opposite directions. The
 * first listed Decode's own pipeline stages — UNDERSTAND, PLAN, SCRIPT — which
 * explained the system to someone who had not yet been told what it does. The
 * second listed seven specific filenames from the seed, which read as a
 * directory listing: "ddpm-2020.pdf" says nothing to a teacher, and one of the
 * URLs was an invented domain on a page whose whole standard is that nothing
 * on it is fake.
 *
 * A capability line should name kinds. Format chip plus a plain noun, so a
 * student, an engineer and a teacher each find their own row in it — and so it
 * actually answers the headline's promise of "any technical source" instead of
 * illustrating it with someone else's reading list.
 */
const KINDS = [
  ["PDF", "a paper"],
  ["PPTX", "lecture slides"],
  ["EPUB", "a book chapter"],
  ["MD", "documentation"],
  ["URL", "a long article"],
  ["DOCX", "your own notes"],
] as const;

export function SourceStrip() {
  return (
    <div
      data-hero-strip
      className="studio-shell mt-7"
    >
      <div className="studio-surface-muted rail-x flex items-center gap-5 overflow-x-auto px-4 py-3.5 sm:px-5">
        <span className="flex-none font-mono text-[9.5px] tracking-[0.14em] text-t6 uppercase">
          Works with
        </span>

        {KINDS.map(([ext, label]) => (
          <span key={ext} className="flex flex-none items-center gap-2 whitespace-nowrap">
            <span className="rounded-[5px] border border-line-input bg-card px-1.5 py-[3px] font-mono text-[8.5px] tracking-[0.08em] text-t6 shadow-xs">
              {ext}
            </span>
            <span className="text-[12.5px] text-t5">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
