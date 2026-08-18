import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  interpolateColors,
} from "remotion";

const TRACE = { item: "geeks", m: 10, indices: [6, 1, 6] };

export const BloomScene: React.FC = () => {
  const frame = useCurrentFrame();
  const litIndices = new Set(TRACE.indices);

  const canvasWidth = 1920;
  const cellSize = 150;
  const cellGap = 18;
  const rowWidth = TRACE.m * cellSize + (TRACE.m - 1) * cellGap;
  const rowX = (canvasWidth - rowWidth) / 2;
  const rowY = 360;
  const chipX = canvasWidth / 2;
  const chipY = 142;
  const chipWidth = 220;
  const chipHeight = 76;
  const targetY = rowY + cellSize / 2;

  const titleOpacity = interpolate(frame, [0, 18], [0, 1]);
  const chipOpacity = interpolate(frame, [34, 48], [0, 1]);
  const captionOpacity = interpolate(frame, [78, 92], [0, 1]);
  const arrowOpacity = interpolate(frame, [46, 52], [0, 1]);
  const fillProgress = interpolate(frame, [70, 88], [0, 1]);

  const cellCenterX = (index: number) =>
    rowX + index * (cellSize + cellGap) + cellSize / 2;

  const caption = `${TRACE.item} → hashes to ${TRACE.indices.join(", ")}`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0B0B0B",
        color: "#F3F0EA",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        fontWeight: 800,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 54,
          left: 0,
          width: "100%",
          textAlign: "center",
          fontSize: 52,
          lineHeight: 1.1,
          letterSpacing: -1.5,
          opacity: titleOpacity,
        }}
      >
        Add “geeks” — set the bits it hashes to
      </div>

      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="6"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L12,6 L0,12 Z" fill="#F2A47B" />
          </marker>
        </defs>

        {TRACE.indices.map((index, occurrence) => {
          const targetX = cellCenterX(index);
          const distance = Math.sqrt(
            Math.pow(targetX - chipX, 2) +
              Math.pow(targetY - (chipY + chipHeight / 2), 2)
          );
          const dashOffset = interpolate(
            frame,
            [48 + occurrence * 4, 68 + occurrence * 4],
            [distance, 0]
          );

          return (
            <line
              key={`${index}-${occurrence}`}
              x1={chipX}
              y1={chipY + chipHeight / 2}
              x2={targetX}
              y2={targetY}
              stroke="#F2A47B"
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${distance} ${distance}`}
              strokeDashoffset={dashOffset}
              markerEnd="url(#arrowhead)"
              opacity={arrowOpacity}
            />
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          left: chipX - chipWidth / 2,
          top: chipY,
          width: chipWidth,
          height: chipHeight,
          borderRadius: 18,
          backgroundColor: "#232323",
          border: "3px solid #484848",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 34,
          letterSpacing: 0.5,
          opacity: chipOpacity,
          boxSizing: "border-box",
        }}
      >
        {TRACE.item}
      </div>

      <div
        style={{
          position: "absolute",
          left: rowX,
          top: rowY,
          width: rowWidth,
          display: "flex",
          gap: cellGap,
        }}
      >
        {Array.from({ length: TRACE.m }, (_, index) => {
          const cellOpacity = interpolate(
            frame,
            [12 + index * 2, 25 + index * 2],
            [0, 1]
          );
          const fill = litIndices.has(index)
            ? interpolateColors(fillProgress, [0, 1], ["#232323", "#F2A47B"])
            : "#232323";

          return (
            <div
              key={index}
              style={{
                width: cellSize,
                opacity: cellOpacity,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 22,
                  backgroundColor: fill,
                  border: "3px solid #484848",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 110,
                  lineHeight: 1,
                  color: litIndices.has(index) ? "#0B0B0B" : "#F3F0EA",
                }}
              >
                0
              </div>
              <div
                style={{
                  marginTop: 18,
                  fontSize: 28,
                  color: "#98A0B3",
                  lineHeight: 1,
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
          top: 650,
          left: 0,
          width: "100%",
          textAlign: "center",
          color: "#F2A47B",
          fontSize: 42,
          letterSpacing: 0.2,
          opacity: captionOpacity,
        }}
      >
        {caption}
      </div>
    </AbsoluteFill>
  );
};
