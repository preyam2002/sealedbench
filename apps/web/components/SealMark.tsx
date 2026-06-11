export function SealMark({ size = 96 }: { size?: number }) {
  const teeth = Array.from({ length: 48 });
  const arc = "M 0 -33 A 33 33 0 1 1 -0.01 -33"; // near-full circle path for curved text
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="SealedBench notary stamp"
      style={{ mixBlendMode: "multiply", color: "var(--color-seal)" }}
    >
      <defs>
        <path id="seal-upper" d={arc} />
      </defs>
      <g transform="translate(50,50)">
        {/* serrated stamp rim */}
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
              stroke="currentColor"
              strokeWidth={1.6}
              opacity={0.6}
            />
          );
        })}
        {/* faint ink wash */}
        <circle r="46" fill="var(--color-seal)" opacity="0.07" />
        {/* double ruled ring of the stamp die */}
        <circle
          r="44"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          opacity="0.85"
        />
        <circle
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.75"
        />
        <circle
          r="27"
          fill="none"
          stroke="var(--color-seal-bright)"
          strokeWidth="0.7"
          opacity="0.65"
          strokeDasharray="1.5 2.5"
        />
        {/* curved legend around the top */}
        <text
          fontFamily="var(--font-mono)"
          fontSize="5.4"
          letterSpacing="2.6"
          fill="currentColor"
          opacity="0.9"
        >
          <textPath href="#seal-upper" startOffset="50%" textAnchor="middle">
            · NOTARIZED ON SUI · SEALEDBENCH ·
          </textPath>
        </text>
        {/* monogram */}
        <text
          x="0"
          y="-1"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="var(--font-display)"
          fontStyle="italic"
          fontWeight={900}
          fontSize="30"
          fill="var(--color-seal-bright)"
        >
          SB
        </text>
        <text
          x="0"
          y="18"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="5"
          letterSpacing="2.6"
          fill="currentColor"
          opacity="0.85"
        >
          SEALED
        </text>
        {/* small register marks at the cardinal points */}
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={`reg-${deg}`}
            x1="0"
            y1="-32"
            x2="0"
            y2="-37"
            stroke="currentColor"
            strokeWidth="0.9"
            opacity="0.7"
            transform={`rotate(${deg})`}
          />
        ))}
      </g>
    </svg>
  );
}
