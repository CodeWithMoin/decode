"use client";

import { useStudio } from "@/store/studio";
import { Canvas } from "@/components/project/canvas/Canvas";
import { Inspector } from "@/components/project/Inspector";
import { Timeline } from "@/components/project/timeline/Timeline";

/**
 * The Edit workspace — storyboard and timeline merged into one surface.
 *
 * Three components, each owning its own store reads, composed here and nowhere
 * else. This is the only stage with a right inspector, so the panel lives in
 * this file rather than in the shell: putting it in the shell would mean the
 * shell knowing which stage is which, and every other stage rendering an empty
 * 318px gutter.
 *
 * The workspace is height-constrained rather than page-scrolled. The timeline
 * has to stay pinned to the bottom of the viewport while the canvas takes the
 * remaining space — a scrolling page would push it off-screen and the scrub
 * would be unreachable exactly when you need it. `--header-h` keeps that sum
 * honest if the header's padding ever changes.
 */
export function Edit() {
  // One right panel at a time.
  //
  // Edit is the only stage that already owns a side panel, so opening the
  // The Production room here used to produce three columns — canvas, Scene
  // settings and conversation — and the canvas ended up the narrowest of the
  // three. Conversation is scene-scoped like the Inspector, so it stands in
  // for that panel rather than stacking beside it.
  const threadOpen = useStudio((s) => s.threadOpen);

  return (
    <div className="flex min-h-0 flex-col lg:h-full lg:flex-row">
      {/* Canvas above, transport below — the timeline is a flex sibling of the
          canvas, never an overlay, so tall canvas content can never cover the
          scrub track. */}
      <div className="flex min-h-[620px] min-w-0 flex-none flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:min-h-0 lg:flex-1">
        <div className="min-h-[280px] flex-1">
          <Canvas />
        </div>
        <div className="flex-none">
          <Timeline />
        </div>
      </div>

      <Inspector inactive={threadOpen} />
    </div>
  );
}
