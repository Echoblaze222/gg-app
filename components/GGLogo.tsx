// components/GGLogo.tsx
// ── Place at: gg-app/components/GGLogo.tsx ───────────────────────────────────
// Usage:
//   <GGLogo size={40} />         ← icon only (header/navbar)
//   <GGLogo size={80} full />    ← icon + text (login/register page)

interface GGLogoProps {
  size?: number;
  full?: boolean;
}

export default function GGLogo({ size = 40, full = false }: GGLogoProps) {
  const id = Math.random().toString(36).slice(2, 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: full ? 14 : 0 }}>
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none"
        style={{ display: "block", filter: `drop-shadow(0 0 ${size * 0.18}px rgba(0,123,255,0.55))` }}>
        <defs>
          <radialGradient id={`bg${id}`} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#001d3d"/>
            <stop offset="100%" stopColor="#000510"/>
          </radialGradient>
          <linearGradient id={`blue${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60b4ff"/>
            <stop offset="50%" stopColor="#007BFF"/>
            <stop offset="100%" stopColor="#0040ff"/>
          </linearGradient>
          <linearGradient id={`white${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff"/>
            <stop offset="50%" stopColor="#d0e8ff"/>
            <stop offset="100%" stopColor="#90c0ff"/>
          </linearGradient>
          <linearGradient id={`shield${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#002a5c"/>
            <stop offset="100%" stopColor="#000d1f"/>
          </linearGradient>
          <linearGradient id={`coin${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60b4ff"/>
            <stop offset="100%" stopColor="#0040ff"/>
          </linearGradient>
          <linearGradient id={`halo${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#007BFF" stopOpacity="0"/>
            <stop offset="30%" stopColor="#60b4ff"/>
            <stop offset="70%" stopColor="#60b4ff"/>
            <stop offset="100%" stopColor="#007BFF" stopOpacity="0"/>
          </linearGradient>
          <filter id={`glow${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id={`haloF${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="60" cy="60" r="59" fill="#000510"/>
        <circle cx="60" cy="60" r="57" fill={`url(#bg${id})`}/>
        <circle cx="60" cy="60" r="55" fill="none" stroke={`url(#blue${id})`} strokeWidth="1.2" opacity="0.75"/>
        <g filter={`url(#haloF${id})`}>
          <ellipse cx="60" cy="19" rx="20" ry="5" fill="none" stroke={`url(#halo${id})`} strokeWidth="3"/>
        </g>
        <ellipse cx="60" cy="19" rx="20" ry="5" fill="none" stroke="rgba(150,210,255,0.35)" strokeWidth="1.2"/>
        <path d="M60 27 L92 37 L92 62 Q92 86 60 97 Q28 86 28 62 L28 37 Z" fill={`url(#shield${id})`}/>
        <path d="M60 27 L92 37 L92 62 Q92 86 60 97 Q28 86 28 62 L28 37 Z" fill="none" stroke={`url(#blue${id})`} strokeWidth="1.6"/>
        <line x1="34" y1="62" x2="86" y2="62" stroke={`url(#blue${id})`} strokeWidth="0.7" opacity="0.5"/>
        <text x="60" y="56" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif"
          fontSize="28" fontWeight="900" fill={`url(#white${id})`} filter={`url(#glow${id})`} letterSpacing="-1">GG</text>
        <ellipse cx="60" cy="87" rx="16" ry="4.2" fill="#000d1f" stroke="rgba(0,123,255,0.4)" strokeWidth="1"/>
        <rect x="44" y="80" width="32" height="7" fill="#000d1f"/>
        <ellipse cx="60" cy="83" rx="16" ry="4.2" fill="#000d1f" stroke="rgba(0,123,255,0.6)" strokeWidth="1"/>
        <rect x="44" y="76" width="32" height="7" fill="#000d1f"/>
        <ellipse cx="60" cy="79" rx="16" ry="4.2" fill={`url(#coin${id})`} stroke="#007BFF" strokeWidth="1.2"/>
        <text x="60" y="81" textAnchor="middle" fontFamily="Arial" fontSize="5" fontWeight="900" fill="rgba(255,255,255,0.85)">₦</text>
        <circle cx="60" cy="5" r="2.5" fill={`url(#blue${id})`} opacity="0.8"/>
        <circle cx="60" cy="115" r="2.5" fill={`url(#blue${id})`} opacity="0.8"/>
        <circle cx="5" cy="60" r="2.5" fill={`url(#blue${id})`} opacity="0.8"/>
        <circle cx="115" cy="60" r="2.5" fill={`url(#blue${id})`} opacity="0.8"/>
      </svg>

      {full && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: size * 0.3, fontWeight: 800, fontFamily: "Georgia,'Times New Roman',serif", background: "linear-gradient(180deg,#ffffff 0%,#d0e8ff 50%,#90c0ff 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>
            God's Grace
          </div>
          <div style={{ fontSize: size * 0.1, color: "rgba(96,180,255,0.7)", letterSpacing: size * 0.045, textTransform: "uppercase" as const, marginTop: 5, fontFamily: "Arial,sans-serif" }}>
            Fintech · Thrift &amp; Ajo
          </div>
        </div>
      )}
    </div>
  );
}
