import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  interpolateColors,
} from "remotion";

const TRACE = {"m": 10, "bits": [0, 0, 0, 1, 1, 1, 1, 1, 1, 1], "added": ["geeks", "nerd", "filter", "hash"], "query": {"item": "dog", "indices": [3, 5, 9], "read": [1, 1, 1], "present": true, "falsePositive": true}} as const;

export const BloomScene: React.FC = () => {
  const frame = useCurrentFrame();

  const n = (from: number, to: number, input = [0, 150]) =>
    interpolate(frame, input, [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const col = (from: string, to: string = from, input = [0, 150]) =>
    interpolateColors(frame, input, [from, to]);

  const canvasWidth = n(1920, 1920);
  const canvasHeight = n(1080, 1080);
  const cellWidth = n(124, 124);
  const cellHeight = n(116, 116);
  const gap = n(18, 18);
  const rowWidth = n(
    TRACE.m * 124 + (TRACE.m - 1) * 18,
    TRACE.m * 124 + (TRACE.m - 1) * 18
  );
  const rowLeft = n((1920 - (TRACE.m * 124 + (TRACE.m - 1) * 18)) / 2, (1920 - (TRACE.m * 124 + (TRACE.m - 1) * 18)) / 2);
  const cellTop = n(394, 394);
  const cellCenterY = n(452, 452);
  const chipTop = n(158, 158);
  const chipHeight = n(76, 76);
  const chipCenterX = n(canvasWidth / 2, canvasWidth / 2);
  const chipBottomY = n(chipTop + chipHeight, chipTop + chipHeight);

  const titleOpacity = n(0, 1, [0, 28]);
  const chipOpacity = n(0, 1, [38, 58]);
  const verdictOpacity = n(0, 1, [98, 116]);
  const captionOpacity = n(0, 1, [108, 128]);

  const surface = col("#232323");
  const edge = col("#484848");
  const ink = col("#F3F0EA");
  const dim = col("#98A0B3");
  const accent = col("#F2A47B");
  const background = col("#0B0B0B");

  return (
    <AbsoluteFill
      style={{
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: background,
        color: ink,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontWeight: n(800, 800),
        overflow: "hidden",
      }}
    >
      <svg
        width={canvasWidth}
        height={canvasHeight}
        viewBox="0 0 1920 1080"
        style={{
          position: "absolute",
          left: n(0, 0),
          top: n(0, 0),
          overflow: "visible",
        }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth={n(16, 16)}
            markerHeight={n(16, 16)}
            refX={n(13, 13)}
            refY={n(6, 6)}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M 0 0 L 14 6 L 0 12 z"
              fill={accent}
              opacity={n(0.92, 0.92)}
            />
          </marker>
        </defs>
        {TRACE.query.indices.map((index, order) => {
          const targetX =
            rowLeft + index * (cellWidth + gap) + cellWidth / 2;
          const targetY = cellCenterY;
          const dx = targetX - chipCenterX;
          const dy = targetY - chipBottomY;
          const length = Math.sqrt(dx * dx + dy * dy);
          const start = 58 + order * 8;
          const end = start + 22;
          const dashOffset = interpolate(
            frame,
            [start, end],
            [length, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const opacity = interpolate(
            frame,
            [start, start + 4],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <line
              key={`arrow-${index}`}
              x1={chipCenterX}
              y1={chipBottomY}
              x2={targetX}
              y2={targetY}
              stroke={accent}
              strokeWidth={n(5, 5)}
              strokeLinecap="round"
              strokeDasharray={`${length} ${length}`}
              strokeDashoffset={dashOffset}
              markerEnd="url(#arrowhead)"
              opacity={opacity}
            />
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          left: n(0, 0),
          top: n(70, 70),
          width: canvasWidth,
          textAlign: "center",
          fontSize: n(58, 58),
          lineHeight: n(1.05, 1.05),
          letterSpacing: n(-2, -2),
          opacity: titleOpacity,
          color: ink,
        }}
      >
        Is “{TRACE.query.item}” in the set?
      </div>

      <div
        style={{
          position: "absolute",
          left: n(chipCenterX - 142, chipCenterX - 142),
          top: chipTop,
          width: n(284, 284),
          height: chipHeight,
          borderRadius: n(38, 38),
          border: `${n(3, 3)}px solid ${edge}`,
          backgroundColor: surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: n(34, 34),
          letterSpacing: n(0.5, 0.5),
          opacity: chipOpacity,
        }}
      >
        {TRACE.query.item}
      </div>

      <div
        style={{
          position: "absolute",
          left: rowLeft,
          top: cellTop,
          width: rowWidth,
          display: "flex",
          gap,
          alignItems: "flex-start",
        }}
      >
        {Array.from({ length: TRACE.m }, (_, i) => {
          const appearStart = 18 + i * 4;
          const cellOpacity = interpolate(
            frame,
            [appearStart, appearStart + 16],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const cellScale = interpolate(
            frame,
            [appearStart, appearStart + 16],
            [0.82, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const queried = TRACE.query.indices.includes(i);
          const pulse = queried
            ? interpolate(
                frame,
                [92, 101, 110, 119],
                [1, 1.08, 1.08, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            : n(1, 1);
          const scale = cellScale * pulse;
          const fill = TRACE.bits[i] === 1 ? accent : surface;

          return (
            <div
              key={`cell-${i}`}
              style={{
                width: cellWidth,
                opacity: cellOpacity,
                transform: `scale(${scale})`,
                transformOrigin: "center center",
              }}
            >
              <div
                style={{
                  width: cellWidth,
                  height: cellHeight,
                  borderRadius: n(22, 22),
                  border: `${n(3, 3)}px solid ${edge}`,
                  backgroundColor: fill,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: TRACE.bits[i] === 1 ? background : dim,
                  fontSize: n(31, 31),
                }}
              >
                {TRACE.bits[i]}
              </div>
              <div
                style={{
                  marginTop: n(14, 14),
                  textAlign: "center",
                  color: dim,
                  fontSize: n(23, 23),
                  lineHeight: n(1, 1),
                }}
              >
                {i}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: n(610, 610),
          top: n(650, 650),
          width: n(700, 700),
          height: n(82, 82),
          borderRadius: n(41, 41),
          border: `${n(3, 3)}px solid ${accent}`,
          backgroundColor: col("#34251F"),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: TRACE.query.present ? accent : ink,
          fontSize: n(34, 34),
          letterSpacing: n(0.2, 0.2),
          opacity: verdictOpacity,
        }}
      >
        {TRACE.query.present ? "probably seen" : "definitely NOT seen"}
      </div>

      {TRACE.query.falsePositive && (
        <div
          style={{
            position: "absolute",
            left: n(0, 0),
            top: n(790, 790),
            width: canvasWidth,
            textAlign: "center",
            color: dim,
            fontSize: n(29, 29),
            letterSpacing: n(0.4, 0.4),
            opacity: captionOpacity,
          }}
        >
          {`${TRACE.query.item} → ${TRACE.query.indices.join(", ")} — all set, but never added`}
        </div>
      )}
    </AbsoluteFill>
  );
};
