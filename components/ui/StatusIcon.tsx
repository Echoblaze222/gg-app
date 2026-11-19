/** One distinct icon shape per tone, so status is never color alone. */
export type Tone = "info" | "success" | "pending" | "warning" | "error";

export function StatusIcon({ tone, className }: { tone: Tone; className?: string }) {
  const common = { className, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true as const };
  const stroke = { stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (tone) {
    case "success":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8" {...stroke} />
          <path d="M6.5 10.25l2.5 2.5 4.5-5" {...stroke} />
        </svg>
      );
    case "pending":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8" {...stroke} />
          <path d="M10 5.75V10l2.75 1.75" {...stroke} />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M10 2.75l7.5 13H2.5l7.5-13z" {...stroke} />
          <path d="M10 8.25v3.5M10 14v.01" {...stroke} />
        </svg>
      );
    case "error":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8" {...stroke} />
          <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" {...stroke} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8" {...stroke} />
          <path d="M10 9v4.5M10 6.25v.01" {...stroke} />
        </svg>
      );
  }
}
