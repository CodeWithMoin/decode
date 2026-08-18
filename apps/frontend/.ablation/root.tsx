import React from "react";
import { Composition, registerRoot } from "remotion";
import { BloomScene } from "./BloomScene";

const Root: React.FC = () => (
  <Composition id="Bloom" component={BloomScene} width={1920} height={1080} fps={30} durationInFrames={120} />
);

registerRoot(Root);
