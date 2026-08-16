import React from "react";
import { Composition, registerRoot, Series } from "remotion";
import { InsertScene } from "./scenes/Insert";
import { QueryNoScene } from "./scenes/QueryNo";
import { QueryFpScene } from "./scenes/QueryFp";

const Arc: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={150}><InsertScene /></Series.Sequence>
    <Series.Sequence durationInFrames={150}><QueryNoScene /></Series.Sequence>
    <Series.Sequence durationInFrames={150}><QueryFpScene /></Series.Sequence>
  </Series>
);

const Root: React.FC = () => (
  <Composition id="Arc" component={Arc} width={1920} height={1080} fps={30} durationInFrames={450} />
);

registerRoot(Root);
