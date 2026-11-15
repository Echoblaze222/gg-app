import { useId, type ComponentProps } from "react";

export interface BrandSymbolProps extends Omit<ComponentProps<"svg">, "children" | "viewBox"> {
  /** `ink` for light surfaces, `inverse` for black surfaces, `mono` for one colour print (no accent). */
  tone?: "ink" | "inverse" | "mono";
  /** Accessible name. Leave empty when the symbol sits next to the wordmark, which already names the brand. */
  title?: string;
}

/**
 * The GG symbol: two equal rings that overlap. Two people, one shared pot.
 * The overlap is the only place the accent shows. Reads down to 16 px because it is two strokes and one lens.
 */
export function BrandSymbol({ tone = "ink", title, className, ...rest }: BrandSymbolProps) {
  const clipId = useId();
  const stroke = tone === "inverse" ? "#ffffff" : "#111111";
  const lens = tone === "mono" ? stroke : tone === "inverse" ? "#c4b0ff" : "#6d3fd0";
  return (
    <svg
      viewBox="0 0 48 32"
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={className}
      {...rest}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="17" cy="16" r="11" />
        </clipPath>
      </defs>
      <circle cx="31" cy="16" r="11" fill={lens} clipPath={`url(#${clipId})`} />
      <circle cx="17" cy="16" r="11" fill="none" stroke={stroke} strokeWidth="3.5" />
      <circle cx="31" cy="16" r="11" fill="none" stroke={stroke} strokeWidth="3.5" />
    </svg>
  );
}
