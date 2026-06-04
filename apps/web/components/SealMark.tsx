export function SealMark({ size = 96 }: { size?: number }) {
  const teeth = Array.from({ length: 48 });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="SealedBench wax seal"
      style={{ filter: "drop-shadow(0 6px 20px rgba(196,69,47,0.35))" }}
    >
      <g transform="translate(50,50)">
        {teeth.map((_, i) => {
          const a = (i / teeth.length) * Math.PI * 2;
          const r1 = 44;
          const r2 = 48;
          return (
            <line
              key={`tick-${a.toFixed(4)}`}
              x1={Math.cos(a) * r1}
              y1={Math.sin(a) * r1}
              x2={Math.cos(a) * r2}
              y2={Math.sin(a) * r2}
              stroke="var(--color-seal)"
              strokeWidth={1.4}
              opacity={0.55}
            />
          );
        })}
        <circle r="42" fill="var(--color-seal)" opacity="0.14" />
        <circle
          r="42"
          fill="none"
          stroke="var(--color-seal)"
          strokeWidth="1.5"
        />
        <circle
          r="34"
          fill="none"
          stroke="var(--color-seal-bright)"
          strokeWidth="0.75"
          opacity="0.7"
          strokeDasharray="2 3"
        />
        <text
          x="0"
          y="2"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="var(--font-display)"
          fontWeight={900}
          fontSize="30"
          fill="var(--color-seal-bright)"
        >
          SB
        </text>
        <text
          x="0"
          y="22"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="5.5"
          letterSpacing="2"
          fill="var(--color-seal)"
        >
          SEALED
        </text>
      </g>
    </svg>
  );
}
