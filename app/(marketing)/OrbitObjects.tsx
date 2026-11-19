import type { CSSProperties, ReactNode } from "react";

/**
 * The drawn objects that circle the piggy bank: receipt, calendar, shield, phone and a pile of coins.
 * Pure decoration, so the whole ring is hidden from assistive technology. Each object is real 3D: it sits at its own
 * angle and depth on a ring, follows the turn of the pig (the --spin variable set by Turntable) and always faces the viewer.
 * Drawn in the same ink and gold as the pig so they read as one scene.
 */

const GOLD = "#E8B242";
const GOLD_DARK = "#C98F2A";

const ink = {
  stroke: "currentColor",
  strokeWidth: 3.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

function Receipt() {
  return (
    <svg viewBox="0 0 100 122" aria-hidden="true" focusable="false">
      <path d="M17 7H83V110L75 102L67 110L59 102L51 110L43 102L35 110L27 102L17 110Z" fill="var(--color-surface)" {...ink} />
      <path d="M29 26H71M29 38H71M29 50H56" fill="none" {...ink} strokeWidth={2.6} />
      <path d="M69 62L79 52M62 62L79 45M55 62L73 44" fill="none" {...ink} strokeWidth={1.6} opacity={0.55} />
      <circle cx="50" cy="78" r="15" fill={GOLD} {...ink} />
      <path d="M42.5 78.5L48 84L58 72" fill="none" {...ink} strokeWidth={3.6} />
    </svg>
  );
}

function Calendar() {
  return (
    <svg viewBox="0 0 104 100" aria-hidden="true" focusable="false">
      <rect x="9" y="17" width="86" height="74" rx="7" fill="var(--color-surface)" {...ink} />
      <path d="M9 38H95V24a7 7 0 0 0-7-7H16a7 7 0 0 0-7 7Z" fill={GOLD} {...ink} />
      <path d="M30 8V25M74 8V25" fill="none" {...ink} strokeWidth={4.6} />
      <g fill="currentColor">
        <circle cx="26" cy="52" r="2.6" />
        <circle cx="44" cy="52" r="2.6" />
        <circle cx="62" cy="52" r="2.6" />
        <circle cx="80" cy="52" r="2.6" />
        <circle cx="26" cy="68" r="2.6" />
        <circle cx="44" cy="68" r="2.6" />
        <circle cx="26" cy="82" r="2.6" opacity="0" />
      </g>
      <circle cx="64" cy="69" r="10.5" fill={GOLD} {...ink} />
      <path d="M58.5 69.5L62.5 73.5L70 64.5" fill="none" {...ink} strokeWidth={3} />
      <path d="M84 62L90 56M84 70L90 64M84 78L90 72" fill="none" {...ink} strokeWidth={1.6} opacity={0.55} />
    </svg>
  );
}

function Shield() {
  return (
    <svg viewBox="0 0 90 106" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="orbit-shield-clip">
          <path d="M45 7L81 21V53C81 78 64 94 45 100C26 94 9 78 9 53V21Z" />
        </clipPath>
      </defs>
      <path d="M45 7L81 21V53C81 78 64 94 45 100C26 94 9 78 9 53V21Z" fill="var(--color-surface)" {...ink} />
      <g clipPath="url(#orbit-shield-clip)" stroke="currentColor" strokeWidth="1.6" opacity="0.55" strokeLinecap="round">
        <path d="M47 100L86 62M47 90L86 52M47 80L86 42M47 70L86 32M60 100L86 74" fill="none" />
      </g>
      <path d="M45 7L81 21V53C81 78 64 94 45 100C26 94 9 78 9 53V21Z" fill="none" {...ink} />
      <circle cx="45" cy="50" r="17" fill={GOLD} {...ink} />
      <path d="M36 50.5L43 57.5L55 43" fill="none" {...ink} strokeWidth={4} />
    </svg>
  );
}

function Phone() {
  return (
    <svg viewBox="0 0 72 124" aria-hidden="true" focusable="false">
      <rect x="9" y="5" width="54" height="114" rx="11" fill="var(--color-surface)" {...ink} />
      <rect x="16" y="17" width="40" height="84" rx="3" fill="none" {...ink} strokeWidth={2.4} />
      <path d="M30 11H42" fill="none" {...ink} strokeWidth={3} />
      <circle cx="36" cy="40" r="11" fill={GOLD} {...ink} strokeWidth={3} />
      <path d="M30.5 40.5L34.5 44.5L42 35.5" fill="none" {...ink} strokeWidth={3} />
      <path d="M24 66H48M24 76H48M24 86H40" fill="none" {...ink} strokeWidth={2.4} />
      <path d="M31 110H41" fill="none" {...ink} strokeWidth={3} />
      <path d="M51 96L58 88M45 96L58 83" fill="none" {...ink} strokeWidth={1.6} opacity={0.55} />
    </svg>
  );
}

function Coin({ cx, cy, stroke = 3.2 }: { cx: number; cy: number; stroke?: number }) {
  return (
    <g>
      <path d={`M${cx - 28} ${cy}V${cy + 10}C${cx - 28} ${cy + 16} ${cx + 28} ${cy + 16} ${cx + 28} ${cy + 10}V${cy}`} fill={GOLD_DARK} {...ink} strokeWidth={stroke} />
      <ellipse cx={cx} cy={cy} rx="28" ry="10" fill={GOLD} {...ink} strokeWidth={stroke} />
      <ellipse cx={cx} cy={cy} rx="17" ry="5.5" fill="none" {...ink} strokeWidth={1.8} />
    </g>
  );
}

function Coins() {
  return (
    <svg viewBox="0 0 110 96" aria-hidden="true" focusable="false">
      <Coin cx={55} cy={68} />
      <Coin cx={55} cy={53} />
      <Coin cx={55} cy={38} />
      <Coin cx={55} cy={23} />
      <path d="M76 70L88 60M70 78L90 62" fill="none" {...ink} strokeWidth={1.6} opacity={0.55} />
    </svg>
  );
}

interface Item {
  key: string;
  node: ReactNode;
  /** Angle on the ring at rest, in degrees. */
  angle: number;
  /** Height on the ring as a fraction of the ring radius. Negative is up. */
  lift: number;
  /** Width in px on small screens and from 768 px. */
  width: [number, number];
  bob: "a" | "b" | "c";
}

const items: Item[] = [
  { key: "receipt", node: <Receipt />, angle: 200, lift: -0.52, width: [52, 74], bob: "a" },
  { key: "calendar", node: <Calendar />, angle: 270, lift: 0.1, width: [64, 92], bob: "b" },
  { key: "shield", node: <Shield />, angle: 340, lift: -0.5, width: [50, 70], bob: "c" },
  { key: "phone", node: <Phone />, angle: 60, lift: -0.12, width: [40, 58], bob: "b" },
  { key: "coins", node: <Coins />, angle: 130, lift: 0.5, width: [58, 82], bob: "a" },
];

/** Place inside the Turntable. The Turntable sets --spin (degrees) as it turns. */
export function OrbitObjects() {
  return (
    <div className="orbit" aria-hidden="true">
      <div className="orbit__ring">
        {items.map((item) => (
          <div
            key={item.key}
            className="orbit__item"
            style={
              {
                "--a": `${item.angle}deg`,
                "--lift": item.lift,
                "--w-sm": `${item.width[0]}px`,
                "--w-md": `${item.width[1]}px`,
              } as CSSProperties
            }
          >
            <div className={`orbit__bob orbit__bob--${item.bob}`}>{item.node}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
