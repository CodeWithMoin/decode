import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  interpolateColors,
} from "remotion";

const TRACE = {"m": 10, "bits": [0, 0, 0, 1, 1, 1, 1, 1, 1, 1], "added": ["geeks", "nerd", "filter", "hash"], "query": {"item": "dog", "indices": [3, 5, 9], "read": [1, 1, 1], "present": true, "falsePositive": true}} as const;

export const QueryFpScene: React.FC = () => {
  const frame = useCurrentFrame();
  const end = 150;

  const bg = interpolateColors(frame, [0, end], ["#0B0B0B", "#0B0B0B"]);
  const surface = interpolateColors(frame, [0, end], ["#232323", "#232323"]);
  const edge = interpolateColors(frame, [0, end], ["#484848", "#484848"]);
  const ink = interpolateColors(frame, [0, end], ["#F3F0EA", "#F3F0EA"]);
  const dim = interpolateColors(frame, [0, end], ["#98A0B3", "#98A0B3"]);
  const accent = interpolateColors(frame, [0, end], ["#F2A47B", "#F2A47B"]);

  const rowLeft = interpolate(frame, [0, end], [330, 330]);
  const rowTop = interpolate(frame, [0, end], [500, 500]);
  const cellWidth = interpolate(frame, [0, end], [108, 108]);
  const cellHeight = interpolate(frame, [0, end], [112, 112]);
  const gap = interpolate(frame, [0, end], [24, 24]);
  const rowWidth = interpolate(
    frame,
    [0, end],
    [TRACE.m * 108 + (TRACE.m - 1) * 24, TRACE.m * 108 + (TRACE.m - 1) * 24]
  );

  const titleOpacity = interpolate(frame, [0, 18, 150], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 18], [58, 48], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleSize = interpolate(frame, [0, end], [58, 58]);
  const labelSize = interpolate(frame, [0, end], [25, 25]);
  const cellRadius = interpolate(frame, [0, end], [14, 14]);
  const borderWidth = interpolate(frame, [0, end], [2, 2]);

  const chipOpacity = interpolate(frame, [42, 58, end], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chipY = interpolate(frame, [42, 58], [244, 220], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chipSize = interpolate(frame, [0, end], [30, 30]);
  const chipPadX = interpolate(frame, [0, end], [32, 32]);
  const chipPadY = interpolate(frame, [0, end], [16, 16]);

  const arrowColor = accent;
  const arrowWidth = interpolate(frame, [0, end], [4, 4]);
  const arrowSize = interpolate(frame, [0, end], [12, 12]);

  const verdict = TRACE.query.present ? "probably seen" : "not seen";
  const caption = `${TRACE.query.item} → ${TRACE.query.indices.join(", ")} all set, but never added — a false positive`;

  const centerX = (index: number) =>
    rowLeft + index * (cellWidth + gap) + cellWidth / 2;
  const centerY = rowTop + cellHeight / 2;

  const cellProgress = (index: number) =>
    interpolate(
      frame,
      [52 + index * 5, 66 + index * 5],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

  const arrowProgress = (index: number) =>
    interpolate(
      frame,
      [62 + index * 8, 78 + index * 8],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

  const ringOpacity = (index: number) =>
    TRACE.query.indices.includes(index)
      ? interpolate(frame, [91, 108], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : interpolate(frame, [0, end], [0, 0]);

  const verdictOpacity = interpolate(frame, [108, 122, end], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(frame, [119, 136, end], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
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
          left: interpolate(frame, [0, end], [120, 120]),
          top: titleY,
          opacity: titleOpacity,
          fontSize: titleSize,
          letterSpacing: interpolate(frame, [0, end], [-1.2, -1.2]),
          color: ink,
        }}
      >
        Is “{TRACE.query.item}” in the set?
      </div>

      <div
        style={{
          position: "absolute",
          left: interpolate(frame, [0, end], [rowLeft, rowLeft]),
          top: interpolate(frame, [0, end], [rowTop - 58, rowTop - 58]),
          width: rowWidth,
          display: "flex",
          justifyContent: "space-between",
          opacity: interpolate(frame, [48, 64, end], [0, 1, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          color: dim,
          fontSize: labelSize,
        }}
      >
        {TRACE.bits.map((_, index) => (
          <div
            key={`index-${index}`}
            style={{
              width: cellWidth,
              textAlign: "center",
              transform: `translateY(${interpolate(
                frame,
                [48, 64],
                [8, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )}px)`,
            }}
          >
            {index}
          </div>
        ))}
      </div>

      <svg
        width={interpolate(frame, [0, end], [1920, 1920])}
        height={interpolate(frame, [0, end], [1080, 1080])}
        style={{
          position: "absolute",
          left: interpolate(frame, [0, end], [0, 0]),
          top: interpolate(frame, [0, end], [0, 0]),
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth={arrowSize}
            markerHeight={arrowSize}
            refX={arrowSize - 1}
            refY={arrowSize / 2}
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path
              d={`M 0 0 L ${arrowSize} ${arrowSize / 2} L 0 ${arrowSize} z`}
              fill={arrowColor}
              opacity={interpolate(frame, [62, 78, end], [0, 1, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            />
          </marker>
        </defs>
        {TRACE.query.indices.map((index) => {
          const x1 = interpolate(frame, [0, end], [960, 960]);
          const y1 = interpolate(frame, [0, end], [286, 286]);
          const x2 = centerX(index);
          const y2 = centerY;
          const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          const dashOffset = interpolate(
            frame,
            [62 + index * 8, 78 + index * 8],
            [length, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <line
              key={`arrow-${index}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={arrowColor}
              strokeWidth={arrowWidth}
              strokeLinecap="round"
              strokeDasharray={interpolate(frame, [0, end], [length, length])}
              strokeDashoffset={dashOffset}
              markerEnd="url(#arrowhead)"
              opacity={interpolate(frame, [62, 78, end], [0, 1, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            />
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          left: interpolate(frame, [0, end], [960, 960]),
          top: chipY,
          transform: "translateX(-50%)",
          padding: `${chipPadY}px ${chipPadX}px`,
          borderRadius: interpolate(frame, [0, end], [18, 18]),
          backgroundColor: surface,
          border: `${borderWidth}px solid ${edge}`,
          color: ink,
          fontSize: chipSize,
          lineHeight: interpolate(frame, [0, end], [1, 1]),
          opacity: chipOpacity,
          boxSizing: "border-box",
        }}
      >
        {TRACE.query.item}
      </div>

      <div
        style={{
          position: "absolute",
          left: rowLeft,
          top: rowTop,
          width: rowWidth,
          height: cellHeight,
          display: "flex",
          gap,
        }}
      >
        {TRACE.bits.map((bit, index) => {
          const targetFill = bit === 1 ? accent : surface;
          const progress = cellProgress(index);
          const fill = interpolateColors(
            progress,
            [0, 1],
            [surface, targetFill]
          );
          return (
            <div
              key={`cell-${index}`}
              style={{
                position: "relative",
                width: cellWidth,
                height: cellHeight,
                flex: `0 0 ${cellWidth}px`,
                boxSizing: "border-box",
                borderRadius: cellRadius,
                backgroundColor: fill,
                border: `${borderWidth}px solid ${edge}`,
                opacity: progress,
                transform: `scale(${interpolate(progress, [0, 1], [0.86, 1])})`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: interpolate(frame, [0, end], [-7, -7]),
                  borderRadius: interpolate(frame, [0, end], [20, 20]),
                  border: `${interpolate(frame, [0, end], [4, 4])}px solid ${accent}`,
                  opacity: ringOpacity(index),
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: interpolate(frame, [0, end], [0, 0]),
                  right: interpolate(frame, [0, end], [0, 0]),
                  top: interpolate(frame, [0, end], [35, 35]),
                  textAlign: "center",
                  color: bit === 1 ? bg : dim,
                  fontSize: interpolate(frame, [0, end], [34, 34]),
                  opacity: interpolate(progress, [0, 1], [0, 1]),
                }}
              >
                {bit}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: interpolate(frame, [0, end], [960, 960]),
          top: interpolate(frame, [108, 122, end], [700, 700, 700]),
          transform: "translateX(-50%)",
          padding: `${interpolate(frame, [0, end], [15, 15])}px ${interpolate(
            frame,
            [0, end],
            [30, 30]
          )}px`,
          borderRadius: interpolate(frame, [0, end], [28, 28]),
          backgroundColor: accent,
          color: bg,
          fontSize: interpolate(frame, [0, end], [31, 31]),
          opacity: verdictOpacity,
          whiteSpace: "nowrap",
        }}
      >
        {verdict}
      </div>

      <div
        style={{
          position: "absolute",
          left: interpolate(frame, [0, end], [960, 960]),
          top: interpolate(frame, [119, 136, end], [786, 786, 786]),
          transform: "translateX(-50%)",
          width: interpolate(frame, [0, end], [1500, 1500]),
          textAlign: "center",
          color: dim,
          fontSize: interpolate(frame, [0, end], [27, 27]),
          lineHeight: interpolate(frame, [0, end], [1.35, 1.35]),
          opacity: captionOpacity,
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </div>
    </AbsoluteFill>
  );
};
