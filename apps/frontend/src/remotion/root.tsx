import { Composition, registerRoot } from "remotion";
import { DecodeComposition, DECODE_FPS, DECODE_HEIGHT, DECODE_WIDTH } from "@/components/player/DecodeComposition";

const Root = () => (
  <Composition
    id="DecodeComposition"
    component={DecodeComposition}
    width={DECODE_WIDTH}
    height={DECODE_HEIGHT}
    fps={DECODE_FPS}
    defaultProps={{
      scenes: [],
      visualPick: {},
    }}
    durationInFrames={1}
  />
);

registerRoot(Root);
