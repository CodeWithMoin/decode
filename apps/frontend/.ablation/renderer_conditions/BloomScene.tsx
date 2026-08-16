import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  interpolateColors,
} from "remotion";

export const BloomScene: React.FC = () => {
  const frame = useCurrentFrame();

  const clamp = (value: number, input: [number, number], output: [number, number]) =>
    interpolate(frame, input, output, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const opacity = (start: number, end: number) => clamp(0, [start, end], [0, 1]);
  const eased = (start: number, end: number) =>
    interpolate(frame, [start, end], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });

  const itemX = clamp(190, [0, 38], [190, 452]);
  const itemOpacity = interpolate(frame, [0, 18, 112, 132], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const panelOpacity = opacity(0, 14);
  const rowOpacity = opacity(8, 26);
  const routeOpacity = opacity(34, 48);
  const selectedLabelOpacity = opacity(66, 86);
  const patternLabelOpacity = opacity(108, 130);

  const cellX = (index: number) => 570 + index * 90;
  const cellY = 570;
  const cellW = 76;
  const cellH = 92;

  const selected = [2, 5, 6];
  const cellProgress = (index: number) => {
    if (index === 6) return eased(62, 74);
    if (index === 2) return eased(76, 88);
    if (index === 5) return eased(89, 101);
    return 0;
  };

  const cellFill = (index: number) =>
    interpolateColors(cellProgress(index), [0, 1], ["#232323", "#F2A47B"]);

  const cellScale = (index: number) => {
    const progress = cellProgress(index);
    return 0.92 + progress * 0.08;
  };

  const routeProgress = [
    eased(38, 62),
    eased(50, 74),
    eased(62, 86),
  ];

  const routeTargets = [2, 5, 6];
  const routePaths = [
    `M 448 420 C 510 420, 520 410, ${cellX(2) + 38} ${cellY}`,
    `M 448 420 C 520 445, 540 490, ${cellX(5) + 38} ${cellY}`,
    `M 448 420 C 535 470, 590 520, ${cellX(6) + 38} ${cellY}`,
  ];

  const tokenScale = 1 + eased(20, 38) * 0.06;

  return (
    <AbsoluteFill
      style={{
        width: 1920,
        height: 1080,
        backgroundColor: "#0B0B0B",
        color: "#F3F0EA",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        overflow: "hidden",
      }}
    >
      <svg width="1920" height="1080" viewBox="0 0 1920 1080">
        <defs>
          <marker
            id="arrow"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill="#F2A47B" />
          </marker>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <text
          x="960"
          y="128"
          textAnchor="middle"
          fill="#F3F0EA"
          opacity={opacity(0, 18)}
          fontSize="30"
          fontWeight="700"
          letterSpacing="2"
        >
          NOW ADD ONE ITEM
        </text>
        <text
          x="960"
          y="174"
          textAnchor="middle"
          fill="#98A0B3"
          opacity={opacity(8, 24)}
          fontSize="24"
          fontWeight="500"
        >
          It leaves a shared pattern behind — not a stored copy
        </text>

        <rect
          x="520"
          y="286"
          width="1050"
          height="486"
          rx="16"
          fill="#232323"
          stroke="#484848"
          strokeWidth="1"
          opacity={panelOpacity}
        />

        <g opacity={itemOpacity} transform={`translate(${itemX}, 0) scale(${tokenScale})`}>
          <rect
            x="0"
            y="366"
            width="230"
            height="108"
            rx="16"
            fill="#232323"
            stroke="#F3F0EA"
            strokeWidth="2"
          />
          <circle cx="36" cy="420" r="13" fill="#F2A47B" />
          <text x="64" y="411" fill="#F3F0EA" fontSize="25" fontWeight="750">
            item
          </text>
          <text x="64" y="443" fill="#98A0B3" fontSize="20" fontWeight="600">
            incoming
          </text>
        </g>

        <g opacity={opacity(8, 25)}>
          <text x="575" y="348" fill="#98A0B3" fontSize="21" fontWeight="700">
            SHARED BIT ROW
          </text>
          <text x="1480" y="348" textAnchor="end" fill="#98A0B3" fontSize="20" fontWeight="600">
            item is not stored
          </text>
        </g>

        <g opacity={rowOpacity}>
          {Array.from({ length: 10 }).map((_, index) => {
            const progress = cellProgress(index);
            const scale = cellScale(index);
            const cx = cellX(index) + cellW / 2;
            const cy = cellY + cellH / 2;
            const oneOpacity =
              index === 6
                ? eased(62, 74)
                : index === 2
                ? eased(76, 88)
                : index === 5
                ? eased(89, 101)
                : 0;

            return (
              <g
                key={index}
                transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}
              >
                <rect
                  x={cellX(index)}
                  y={cellY}
                  width={cellW}
                  height={cellH}
                  rx="12"
                  fill={cellFill(index)}
                  stroke={progress > 0 ? "#F2A47B" : "#484848"}
                  strokeWidth={progress > 0 ? 2 : 1}
                />
                <text
                  x={cx}
                  y={cy + 14}
                  textAnchor="middle"
                  fill={progress > 0 ? "#0B0B0B" : "#98A0B3"}
                  fontSize={progress > 0 ? 40 : 30}
                  fontWeight="800"
                >
                  {progress > 0 ? "1" : "0"}
                </text>
                <text
                  x={cx}
                  y={cellY + cellH + 31}
                  textAnchor="middle"
                  fill="#98A0B3"
                  fontSize="17"
                  fontWeight="600"
                >
                  {index}
                </text>
                <circle
                  cx={cx}
                  cy={cellY - 13}
                  r="5"
                  fill="#F2A47B"
                  opacity={oneOpacity}
                  filter="url(#softGlow)"
                />
              </g>
            );
          })}
        </g>

        <g opacity={routeOpacity}>
          {routePaths.map((path, index) => (
            <path
              key={path}
              d={path}
              fill="none"
              stroke="#F2A47B"
              strokeWidth="4"
              strokeLinecap="round"
              markerEnd="url(#arrow)"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - routeProgress[index]}
              opacity={routeProgress[index]}
            />
          ))}
          {routeTargets.map((target, index) => (
            <text
              key={target}
              x={cellX(target) + 38}
              y={cellY - 35}
              textAnchor="middle"
              fill="#F2A47B"
              fontSize="18"
              fontWeight="750"
              opacity={routeProgress[index]}
            >
              hash {index + 1}
            </text>
          ))}
        </g>

        <g opacity={opacity(28, 45)}>
          <rect x="258" y="520" width="178" height="48" rx="24" fill="#232323" stroke="#484848" />
          <text
            x="347"
            y="551"
            textAnchor="middle"
            fill="#F3F0EA"
            fontSize="21"
            fontWeight="700"
          >
            three hashes
          </text>
        </g>

        <g opacity={selectedLabelOpacity}>
          <rect
            x="1085"
            y="704"
            width="264"
            height="48"
            rx="24"
            fill="#232323"
            stroke="#F2A47B"
            strokeWidth="1"
          />
          <text
            x="1217"
            y="735"
            textAnchor="middle"
            fill="#F2A47B"
            fontSize="21"
            fontWeight="750"
          >
            selected positions
          </text>
        </g>

        <g opacity={opacity(76, 100)}>
          <text x="575" y="850" fill="#98A0B3" fontSize="23" fontWeight="650">
            0
          </text>
          <text x="612" y="850" fill="#F2A47B" fontSize="29" fontWeight="800">
            →
          </text>
          <text x="650" y="850" fill="#F2A47B" fontSize="23" fontWeight="750">
            1
          </text>
          <text x="710" y="850" fill="#98A0B3" fontSize="22" fontWeight="600">
            marked
          </text>
        </g>

        <g opacity={patternLabelOpacity}>
          <line
            x1="960"
            y1="895"
            x2="960"
            y2="934"
            stroke="#484848"
            strokeWidth="2"
          />
          <text
            x="960"
            y="980"
            textAnchor="middle"
            fill="#F3F0EA"
            fontSize="28"
            fontWeight="700"
          >
            shared pattern
          </text>
          <text
            x="960"
            y="1018"
            textAnchor="middle"
            fill="#98A0B3"
            fontSize="22"
            fontWeight="550"
          >
            the filter records marks, not ownership
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
