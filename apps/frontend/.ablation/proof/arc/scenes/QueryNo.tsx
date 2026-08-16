import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  interpolateColors,
} from "remotion";

const TRACE = {"m": 10, "bits": [0, 0, 0, 1, 1, 1, 1, 1, 1, 1], "query": {"item": "cat", "indices": [5, 7, 1], "read": [1, 1, 0], "present": false}} as const;

export const QueryNoScene: React.FC = () => {
  const frame = useCurrentFrame();

  const W = 1920;
  const H = 1080;
  const cellW = 140;
  const cellH = 140;
  const gap = 8;
  const pitch = cellW + gap;
  const rowX = (W - TRACE.m * pitch) / 2;
  const rowY = 420;
  const rowCenterY = rowY + cellH / 2;
  const chipCenterX = W / 2;
  const chipY = 205;
  const chipH = 76;

  const hold = (value: number) => interpolate(frame, [0, 149], [value, value]);
  const color = (from: string, to: string, start = 0, end = 149) =>
    interpolateColors(frame, [start, end], [from, to]);

  const titleOpacity = interpolate(frame, [0, 18, 34], [0, 0.35, 1]);
  const chipOpacity = interpolate(frame, [27, 43, 58], [0, 0.45, 1]);
  const verdictOpacity = interpolate(frame, [104, 119], [0, 1]);
  const captionOpacity = interpolate(frame, [116, 132], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        width: hold(W),
        height: hold(H),
        backgroundColor: color("#0B0B0B", "#0B0B0B"),
        color: "#F3F0EA",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontWeight: 800,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: hold(0),
          top: hold(62),
          width: hold(W),
          textAlign: "center",
          fontSize: hold(58),
          lineHeight: hold(1.1),
          letterSpacing: hold(-1.5),
          opacity: titleOpacity,
          color: color("#F3F0EA", "#F3F0EA"),
        }}
      >
        Is “cat” in the set?
      </div>

      <div
        style={{
          position: "absolute",
          left: hold(chipCenterX - 180),
          top: hold(chipY),
          width: hold(360),
          height: hold(chipH),
          borderRadius: hold(38),
          backgroundColor: color("#232323", "#232323"),
          border: `${hold(2)}px solid ${color("#484848", "#484848")}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: hold(34),
          letterSpacing: hold(0.2),
          opacity: chipOpacity,
        }}
      >
        {TRACE.query.item}
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
          pointerEvents: "none",
        }}
      >
        <defs>
          <marker
            id="query-arrow"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#F2A47B" />
          </marker>
        </defs>
        {TRACE.query.indices.map((idx, order) => {
          const cx = rowX + idx * pitch + cellW / 2;
          const start = 53 + order * 10;
          const end = start + 18;
          const progress = interpolate(frame, [start, end], [0, 1]);
          const lineLength = Math.sqrt(
            Math.pow(cx - chipCenterX, 2) +
              Math.pow(rowCenterY - (chipY + chipH), 2)
          );
          return (
            <line
              key={`arrow-${idx}`}
              x1={hold(chipCenterX)}
              y1={hold(chipY + chipH)}
              x2={hold(cx)}
              y2={hold(rowCenterY)}
              stroke={color("#F2A47B", "#F2A47B")}
              strokeWidth={hold(5)}
              strokeLinecap="round"
              markerEnd="url(#query-arrow)"
              strokeDasharray={hold(lineLength)}
              strokeDashoffset={interpolate(
                frame,
                [start, end],
                [lineLength, 0]
              )}
              opacity={chipOpacity * progress}
            />
          );
        })}
      </svg>

      {TRACE.bits.map((bit, i) => {
        const cx = rowX + i * pitch + cellW / 2;
        const entranceStart = 16 + i * 3;
        const entranceEnd = entranceStart + 18;
        const cellOpacity = interpolate(
          frame,
          [entranceStart, entranceEnd],
          [0, 1]
        );
        const cellScale = interpolate(
          frame,
          [entranceStart, entranceEnd],
          [0.82, 1]
        );
        const targetOrder = TRACE.query.indices.indexOf(i);
        const targetStart =
          targetOrder >= 0 ? 84 + targetOrder * 7 : 149;
        const targetProgress =
          targetOrder >= 0
            ? interpolate(frame, [targetStart, targetStart + 16], [0, 1])
            : 0;
        const fill = interpolateColors(
          frame,
          [entranceStart, entranceEnd],
          ["#0B0B0B", bit === 1 ? "#F2A47B" : "#232323"]
        );
        const isMiss = TRACE.bits[i] === 0 && targetOrder >= 0;
        const ringOpacity = isMiss
          ? interpolate(frame, [targetStart, targetStart + 16], [0, 1])
          : 0;

        return (
          <React.Fragment key={`cell-${i}`}>
            <div
              style={{
                position: "absolute",
                left: hold(cx - cellW / 2),
                top: hold(rowY),
                width: hold(cellW),
                height: hold(cellH),
                borderRadius: hold(14),
                backgroundColor: fill,
                border: `${hold(2)}px solid ${color("#484848", "#484848")}`,
                boxSizing: "border-box",
                opacity: cellOpacity,
                transform: `scale(${cellScale})`,
                transformOrigin: "center center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: hold(32),
                  color: color("#98A0B3", "#98A0B3"),
                  opacity: cellOpacity,
                }}
              >
                {i}
              </span>
            </div>

            {isMiss && (
              <div
                style={{
                  position: "absolute",
                  left: hold(cx - cellW / 2 - 9),
                  top: hold(rowY - 9),
                  width: hold(cellW + 18),
                  height: hold(cellH + 18),
                  borderRadius: hold(21),
                  border: `${hold(7)}px solid ${color(
                    "#F2A47B",
                    "#F2A47B"
                  )}`,
                  boxSizing: "border-box",
                  opacity: ringOpacity,
                  transform: `scale(${interpolate(
                    frame,
                    [targetStart, targetStart + 16],
                    [0.86, 1]
                  )})`,
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: hold(560),
          top: hold(690),
          width: hold(800),
          height: hold(86),
          borderRadius: hold(43),
          backgroundColor: color("#F3F0EA", "#F3F0EA"),
          color: color("#0B0B0B", "#0B0B0B"),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: hold(40),
          letterSpacing: hold(-0.5),
          opacity: verdictOpacity,
        }}
      >
        definitely NOT seen
      </div>

      <div
        style={{
          position: "absolute",
          left: hold(260),
          top: hold(830),
          width: hold(1400),
          textAlign: "center",
          fontSize: hold(30),
          lineHeight: hold(1.25),
          color: color("#98A0B3", "#98A0B3"),
          letterSpacing: hold(0.1),
          opacity: captionOpacity,
        }}
      >
        one bit is 0 — so it was definitely never added
      </div>
    </AbsoluteFill>
  );
};
