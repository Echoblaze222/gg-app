import { BrandSymbol } from "./BrandSymbol";

export interface WordmarkProps {
  /** `lockup` shows symbol and name side by side. `name` shows the name only. */
  layout?: "lockup" | "name";
  tone?: "ink" | "inverse" | "mono";
  className?: string;
}

/** The product name set in the display serif. Real text, so it scales, translates and is read by screen readers. */
export function Wordmark({ layout = "lockup", tone = "ink", className }: WordmarkProps) {
  const color = tone === "inverse" ? "text-ink-inverse" : "text-ink";
  return (
    <span className={`inline-flex items-center gap-2 ${color} ${className ?? ""}`}>
      {layout === "lockup" ? <BrandSymbol tone={tone} className="h-6 w-auto" /> : null}
      <span className="whitespace-nowrap font-display text-xl leading-none tracking-tight sm:text-2xl">GG Contribution</span>
    </span>
  );
}
