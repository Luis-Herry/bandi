/**
 * Pure-CSS + inline-SVG dusk backdrop for the login page.
 *
 * Layers (back → front):
 *   1. radial gradient horizon (theme accent glow against deep slate)
 *   2. atmospheric haze (low-opacity accent mist)
 *   3. SVG mountain silhouette (mid-ground)
 *   4. SVG forest silhouette (foreground tree line)
 *   5. drifting embers (CSS-animated tiny dots)
 *
 * Sized to fill its parent. Pointer-events:none so it never eats clicks.
 */

export function DuskBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* sky + sun */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 75% 88%, rgb(var(--accent-rgb) / 0.55) 0%, rgb(var(--accent-rgb) / 0.20) 28%, transparent 60%),
            radial-gradient(ellipse 110% 60% at 70% 100%, rgb(var(--accent-rgb) / 0.30) 0%, transparent 55%),
            linear-gradient(180deg, var(--bg-base) 0%, color-mix(in srgb, var(--bg-base) 88%, var(--accent) 12%) 45%, color-mix(in srgb, var(--bg-base) 78%, var(--accent) 22%) 75%, color-mix(in srgb, var(--bg-base) 68%, var(--accent) 32%) 100%)
          `,
        }}
      />

      {/* atmospheric haze near horizon */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgb(var(--accent-rgb) / 0.10) 60%, rgb(var(--accent-rgb) / 0.18) 100%)",
        }}
      />

      {/* far mountain silhouette */}
      <svg
        className="absolute inset-x-0"
        style={{ bottom: "26%" }}
        viewBox="0 0 1600 200"
        preserveAspectRatio="none"
        width="100%"
        height="120"
      >
        <path
          d="M0,200 L0,150 L120,90 L240,130 L380,60 L520,120 L680,80 L820,140 L960,70 L1120,110 L1280,90 L1440,130 L1600,100 L1600,200 Z"
          fill="rgba(20, 14, 10, 0.85)"
        />
      </svg>

      {/* foreground forest silhouette */}
      <svg
        className="absolute inset-x-0 bottom-0"
        viewBox="0 0 1600 220"
        preserveAspectRatio="none"
        width="100%"
        height="240"
      >
        <defs>
          <pattern
            id="tree-row"
            x="0"
            y="0"
            width="80"
            height="220"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="
                M5,220 L5,140
                L0,140 L8,90 L3,90 L12,40 L16,40 L20,90 L13,90 L21,140 L8,140 L8,220 Z
                M40,220 L40,160
                L34,160 L42,120 L37,120 L46,70 L51,70 L54,120 L48,120 L55,160 L43,160 L43,220 Z
                M65,220 L65,150
                L60,150 L67,108 L62,108 L70,60 L74,60 L77,108 L71,108 L78,150 L67,150 L67,220 Z
              "
              fill="rgba(5, 4, 3, 0.95)"
            />
          </pattern>
        </defs>
        <rect width="100%" height="220" fill="url(#tree-row)" />
      </svg>

      {/* drifting embers */}
      <div className="absolute inset-0">
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${e.x}%`,
              bottom: `${e.y}%`,
              width: `${e.s}px`,
              height: `${e.s}px`,
              background: "rgb(var(--accent-rgb) / 0.60)",
              boxShadow: "0 0 6px rgb(var(--accent-rgb) / 0.45)",
              animation: `ember-rise ${e.d}s ease-in ${e.delay}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes ember-rise {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          15%  { opacity: 0.8; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(-220px) translateX(12px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="ember-rise"] { animation: none !important; opacity: 0.35 !important; }
        }
      `}</style>
    </div>
  );
}

// 30 embers, hand-distributed so they cluster around the sun
const EMBERS = [
  { x: 60, y: 8, s: 2, d: 7, delay: 0 },
  { x: 65, y: 12, s: 1.5, d: 9, delay: 1.2 },
  { x: 70, y: 6, s: 2, d: 6, delay: 0.5 },
  { x: 75, y: 18, s: 3, d: 8, delay: 2 },
  { x: 78, y: 10, s: 2, d: 7, delay: 3.5 },
  { x: 82, y: 14, s: 1.5, d: 9, delay: 1.8 },
  { x: 85, y: 5, s: 2.5, d: 6, delay: 4 },
  { x: 55, y: 16, s: 2, d: 8, delay: 2.7 },
  { x: 48, y: 8, s: 1.5, d: 10, delay: 0.9 },
  { x: 88, y: 22, s: 2, d: 7, delay: 3.2 },
  { x: 72, y: 24, s: 1.5, d: 9, delay: 5 },
  { x: 90, y: 12, s: 2, d: 6, delay: 1.5 },
  { x: 42, y: 12, s: 1.5, d: 11, delay: 4.5 },
  { x: 68, y: 30, s: 2.5, d: 7, delay: 2.2 },
  { x: 78, y: 32, s: 1.5, d: 8, delay: 0.3 },
  { x: 30, y: 20, s: 2, d: 12, delay: 3.8 },
  { x: 92, y: 28, s: 2, d: 9, delay: 1 },
  { x: 22, y: 14, s: 1.5, d: 13, delay: 5.5 },
  { x: 58, y: 26, s: 2, d: 8, delay: 4.2 },
  { x: 73, y: 38, s: 1.5, d: 7, delay: 0.6 },
];
