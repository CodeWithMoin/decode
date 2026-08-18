import React from "react";
import { Composition } from "remotion";
import Beat01 from "../../backend/scripts/verify_out/beat-01";
import Beat02 from "../../backend/scripts/verify_out/beat-02";
import Beat03 from "../../backend/scripts/verify_out/beat-03";
import meta from "../../backend/scripts/verify_out/meta.json";

const FPS = 30;

// The host stage DecodeComposition paints under every scene — without it a
// transparent scene renders on Remotion's white default and reads wrong.
function staged(C: React.ComponentType<Record<string, unknown>>) {
  return function Staged(props: Record<string, unknown>) {
    return (
      <div style={{ position: "absolute", inset: 0, backgroundColor: "#0B0B0B" }}>
        <C {...props} />
      </div>
    );
  };
}

function comp(id: string, C: React.ComponentType<Record<string, unknown>>) {
  const entry = (meta as Record<string, { duration_seconds: number; controls: Record<string, unknown> }>)[id];
  return (
    <Composition
      key={id}
      id={id}
      component={staged(C)}
      durationInFrames={entry.duration_seconds * FPS}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={entry.controls}
    />
  );
}

export const Root = () => (
  <>
    {comp("beat-01", Beat01)}
    {comp("beat-02", Beat02)}
    {comp("beat-03", Beat03)}
  </>
);
