import { Composition, registerRoot } from "remotion";
import { DecodeComposition, DECODE_FPS, DECODE_HEIGHT, DECODE_WIDTH, getDecodeDurationInFrames } from "@/components/player/DecodeComposition";
import type { DecodeCompositionProps } from "@/components/player/DecodeComposition";
import { D3LossCurve, D3_LOSS_DURATION } from "./prototype/D3LossCurve";
const Root = () => (<><Composition id="DecodeComposition" component={DecodeComposition} width={DECODE_WIDTH} height={DECODE_HEIGHT} fps={DECODE_FPS} defaultProps={{ scenes: [], visualPick: {} }} durationInFrames={1} calculateMetadata={({ props }: { props: DecodeCompositionProps }) => ({ durationInFrames: Math.max(1, getDecodeDurationInFrames(props.scenes ?? [])) })} /><Composition id="D3LossCurve" component={D3LossCurve} width={DECODE_WIDTH} height={DECODE_HEIGHT} fps={DECODE_FPS} durationInFrames={D3_LOSS_DURATION} /></>);
registerRoot(Root);
