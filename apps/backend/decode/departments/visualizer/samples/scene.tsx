import { useProgress, interpolate, Easing, AbsoluteFill, Interactive, fontCss } from "@decode/animation-api";

export default function Scene(props) {
  const progress = useProgress();

  return (
    <AbsoluteFill style={{ background: props.background, display: "grid", placeItems: "center" }}>
      <Interactive.Div
        name="Label"
        style={{
          ...fontCss({ family: "Bricolage Grotesque", weight: 600 }),
          fontSize: 56,
          color: "#E8E8EC",
          opacity: interpolate(progress, [0, 0.25], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          }),
          translate: interpolate(progress, [0, 0.35], ["0px 20px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          }),
        }}
      >
        {props.label}
      </Interactive.Div>
    </AbsoluteFill>
  );
}
