import { Composition, registerRoot } from "remotion";
import { DecodeComposition, DECODE_FPS, DECODE_HEIGHT, DECODE_WIDTH } from "@/components/player/DecodeComposition";
import { DecodeSampleScene, SAMPLE_WORDS } from "@/decode/motion-api/DecodeSampleScene";

const Root = () => (
  <>
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
    {/* The motion-api / TSGB verification scene: measured cards, computed
        connectors, word-anchored verbs — renderable for stills and review. */}
    <Composition
      id="DecodeSampleScene"
      component={DecodeSampleScene}
      width={DECODE_WIDTH}
      height={DECODE_HEIGHT}
      fps={DECODE_FPS}
      durationInFrames={Math.ceil((SAMPLE_WORDS.at(-1)?.endInSeconds ?? 10) + 1) * DECODE_FPS}
    />
  </>
);

registerRoot(Root);
