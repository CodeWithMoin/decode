import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  interpolateColors,
} from "remotion";

const TRACE = {"m": 10, "item": "geeks", "indices": [6, 8, 6], "bits": [0, 0, 0, 0, 0, 0, 1, 0, 1, 0]} as const;

export const InsertScene: React.FC = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const hold = (value: number) => interpolate(frame, [0, 150], [value, value], clamp);
  const colorHold = (value: string) =>
    interpolateColors(frame, [0, 150], [value, value]);

  const W = 1920;
  const H = 1080;
  const cellSize = 132;
  const gap = 24;
  const rowWidth = TRACE.m * cellSize + (TRACE.m - 1) * gap;
  const rowLeft = (W - rowWidth) / 2;
  const rowTop = 505;
  const cellCenterX = (index: number) =>
    rowLeft + cellSize / 2 + index * (cellSize + gap);
  const cellCenterY = rowTop + cellSize / 2;

  const titleOpacity = interpolate(frame, [0, 22], [0, 1], clamp);
  const titleY = interpolate(frame, [0, 22], [40, 0], clamp);
  const chipProgress = interpolate(frame, [32, 52], [0, 1], clamp);
  const chipY = interpolate(frame, [32, 52], [-28, 0], clamp);
  const captionOpacity = interpolate(frame, [105, 125], [0, 1], clamp);
  const verdictOpacity = interpolate(frame, [105, 125], [0, 1], clamp);

  const chipX = W / 2;
  const chipBottom = 345;
  const arrowStartY = 365;

  const arrowProgress = (order: number) =>
    interpolate(
      frame,
      [58 + order * 14, 78 + order * 14],
      [0, 1],
      clamp
    );

  const landingProgress = (index: number) => {
    const arrivals = TRACE.indices
      .map((target, order) => (target === index ? arrowProgress(order) : 0));
    return Math.max(...arrivals);
  };

  const bg = colorHold("#0B0B0B");
  const surface = colorHold("#232323");
  const edge = colorHold("#484848");
  const ink = colorHold("#F3F0EA");
  const dim = colorHold("#98A0B3");
  const accent = colorHold("#F2A47B");

  return (
    <AbsoluteFill
      style={{
        width: hold(W),
        height: hold(H),
        backgroundColor: bg,
        color: ink,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontWeight: 800,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: hold(0),
          top: hold(0),
          width: hold(W),
          height: hold(H),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: hold(92 + titleY),
            opacity: titleOpacity,
            fontSize: hold(64),
            lineHeight: hold(1),
            letterSpacing: hold(-2),
          }}
        >
          Add “{TRACE.item}”
        </div>

        <div
          style={{
            position: "absolute",
            top: hold(242 + chipY),
            left: hold(chipX - 130),
            width: hold(260),
            height: hold(76),
            borderRadius: hold(38),
            backgroundColor: accent,
            color: bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: hold(36),
            letterSpacing: hold(0.5),
            opacity: chipProgress,
            transform: `scale(${interpolate(chipProgress, [0, 1], [0.82, 1])})`,
          }}
        >
          {TRACE.item}
        </div>

        <svg
          width={hold(W)}
          height={hold(H)}
          viewBox={`0 0 ${W} ${H}`}
          style={{
            position: "absolute",
            left: hold(0),
            top: hold(0),
            overflow: "visible",
          }}
        >
          {TRACE.indices.map((target, order) => {
            const x2 = cellCenterX(target);
            const y2 = cellCenterY;
            const x1 = chipX;
            const y1 = arrowStartY;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const progress = arrowProgress(order);
            const endX = x2;
            const endY = y2;
            const angle = Math.atan2(dy, dx);
            const headSize = 18;
            const leftHeadX = endX - headSize * Math.cos(angle - Math.PI / 6);
            const leftHeadY = endY - headSize * Math.sin(angle - Math.PI / 6);
            const rightHeadX = endX - headSize * Math.cos(angle + Math.PI / 6);
            const rightHeadY = endY - headSize * Math.sin(angle + Math.PI / 6);

            return (
              <g key={`arrow-${order}`}>
                <line
                  x1={hold(x1)}
                  y1={hold(y1)}
                  x2={hold(x2)}
                  y2={hold(y2)}
                  stroke={accent}
                  strokeWidth={hold(7)}
                  strokeLinecap="round"
                  strokeDasharray={hold(length)}
                  strokeDashoffset={interpolate(
                    progress,
                    [0, 1],
                    [length, 0]
                  )}
                  opacity={interpolate(
                    frame,
                    [48, 58, 78 + order * 14],
                    [0, 1, 1],
                    clamp
                  )}
                />
                <polygon
                  points={`${endX},${endY} ${leftHeadX},${leftHeadY} ${rightHeadX},${rightHeadY}`}
                  fill={accent}
                  opacity={interpolate(progress, [0.84, 1], [0, 1], clamp)}
                />
              </g>
            );
          })}
        </svg>

        <div
          style={{
            position: "absolute",
            top: hold(rowTop),
            left: hold(rowLeft),
            display: "flex",
            gap: hold(gap),
          }}
        >
          {Array.from({ length: TRACE.m }, (_, index) => {
            const appear = interpolate(
              frame,
              [12 + index * 5, 28 + index * 5],
              [0, 1],
              clamp
            );
            const landing = landingProgress(index);
            const lit = Math.max(TRACE.bits[index], landing);
            const fill = interpolateColors(
              lit,
              [0, 1],
              [surface, accent]
            );
            const ringOpacity = interpolate(landing, [0, 1], [0, 1], clamp);
            const indexOpacity = interpolate(appear, [0, 1], [0.2, 1]);
            const y = interpolate(appear, [0, 1], [26, 0]);
            const scale = interpolate(appear, [0, 1], [0.86, 1]);

            return (
              <div
                key={`cell-${index}`}
                style={{
                  position: "relative",
                  width: hold(cellSize),
                  height: hold(cellSize + 48),
                  opacity: appear,
                  transform: `translateY(${y}px) scale(${scale})`,
                  transformOrigin: "center top",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: hold(0),
                    top: hold(0),
                    width: hold(cellSize),
                    height: hold(cellSize),
                    borderRadius: hold(16),
                    backgroundColor: fill,
                    border: `${hold(3)}px solid ${edge}`,
                    boxSizing: "border-box",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: hold(-6),
                    top: hold(-6),
                    width: hold(cellSize + 12),
                    height: hold(cellSize + 12),
                    borderRadius: hold(21),
                    border: `${hold(5)}px solid ${accent}`,
                    boxSizing: "border-box",
                    opacity: ringOpacity,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: hold(cellSize + 13),
                    width: hold(cellSize),
                    textAlign: "center",
                    color: dim,
                    fontSize: hold(24),
                    lineHeight: hold(1),
                    opacity: indexOpacity,
                  }}
                >
                  {index}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            top: hold(780),
            color: ink,
            fontSize: hold(34),
            letterSpacing: hold(0.2),
            opacity: captionOpacity,
          }}
        >
          {TRACE.item} + sets bits {TRACE.indices.join(", ")}
        </div>

        <div
          style={{
            position: "absolute",
            top: hold(865),
            color: accent,
            fontSize: hold(46),
            letterSpacing: hold(1),
            opacity: verdictOpacity,
          }}
        >
          Inserted ✓
        </div>
      </div>
    </AbsoluteFill>
  );
};
