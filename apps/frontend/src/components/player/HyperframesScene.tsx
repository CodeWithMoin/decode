"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill } from "@decode/animation-api";
import type { Scene } from "@/lib/types";

/**
 * One beat's HyperFrames composition, played in the preview.
 *
 * A HyperFrames scene is **seek-driven**: its animation is one paused GSAP
 * timeline, and the only thing that moves it is `timeline.seek(t)`. So this is a
 * slave to the transport — the player owns the clock, we push the current time
 * in, the composition never pushes a frame back. That one-directional flow is
 * why a HyperFrames scene sidesteps the two-way frame-sync loop that a
 * seek/frameupdate feedback would create (MASTER: one owner per state).
 *
 * The composition runs in a **sandboxed iframe** (`allow-scripts`, no
 * same-origin), so generated HTML executes isolated from the app — the real
 * execution boundary, not the linter. We drive it across that boundary by
 * `postMessage`, and a tiny injected bridge seeks the registered timeline.
 */

// Injected into the composition so the parent can seek across the sandbox
// boundary. It reads the timelines the composition registered on
// `window.__timelines` and seeks them; it reports ready so no seek is lost to a
// not-yet-built timeline.
const SEEK_BRIDGE = `<script>(function(){
  function seek(t){var m=window.__timelines||{};for(var k in m){var tl=m[k];
    if(tl&&typeof tl.seek==='function'){try{tl.seek(t);}catch(e){}}}}
  window.addEventListener('message',function(e){var d=e&&e.data;
    if(d&&d.type==='decode:seek'){seek(d.time);}});
  try{seek(0);}catch(e){}
  if(window.parent){window.parent.postMessage({type:'decode:ready'},'*');}
})();</script>`;

function withBridge(html: string): string {
  return html.includes("</body>")
    ? html.replace("</body>", `${SEEK_BRIDGE}</body>`)
    : html + SEEK_BRIDGE;
}

export function HyperframesScene({ scene, timeSeconds }: { scene: Scene; timeSeconds: number }) {
  const html = scene.compositionHtml ?? "";
  const doc = useMemo(() => (html ? withBridge(html) : ""), [html]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Which document has reported ready. Deriving readiness (readyDoc === doc)
  // rather than resetting a flag in an effect keeps this one-directional: a new
  // document is simply not-yet-ready until its own signal arrives — no
  // set-state-in-effect, no cascading render.
  const [readyDoc, setReadyDoc] = useState<string | null>(null);
  const ready = doc !== "" && readyDoc === doc;
  // The latest doc + time, so the moment the iframe reports ready it lands on the
  // current playhead rather than at 0.
  const docRef = useRef(doc);
  docRef.current = doc;
  const timeRef = useRef(timeSeconds);
  timeRef.current = timeSeconds;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === frameRef.current?.contentWindow &&
        (event.data as { type?: string } | null)?.type === "decode:ready"
      ) {
        setReadyDoc(docRef.current);
        frameRef.current?.contentWindow?.postMessage(
          { type: "decode:seek", time: timeRef.current },
          "*",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The player drives; the composition follows. Push every time change across
  // the sandbox once the timeline exists to receive it.
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ type: "decode:seek", time: timeSeconds }, "*");
  }, [timeSeconds, ready]);

  if (!doc) return <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }} />;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }}>
      <iframe
        ref={frameRef}
        title={`Scene ${scene.id}`}
        srcDoc={doc}
        // Scripts run; no same-origin, so the app stays isolated from generated code.
        sandbox="allow-scripts"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </AbsoluteFill>
  );
}
