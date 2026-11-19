import type { ReactNode } from "react";
import { Card, ErrorState } from "@/components/ui";
import { describeError } from "@/lib/dashboard/describe-error";
import type { Section } from "@/lib/member/home";
import { RetryButton } from "./RetryButton";

export interface TileProps<T> {
  title: string;
  section: Section<T>;
  tone?: "surface" | "ink";
  className?: string;
  /** Right side of the tile header. */
  aside?: ReactNode;
  children: (data: T) => ReactNode;
}

/** A dashboard card that loaded on its own. If its data failed it explains why and offers a retry, and the other cards are unaffected. */
export function Tile<T>({ title, section, tone = "surface", className, aside, children }: TileProps<T>) {
  return (
    <Card as="section" tone={tone} className={className} aria-label={title}>
      <div className="tile">
        <div className="tile__head">
          <h2 className="tile__title">{title}</h2>
          {aside}
        </div>
        {section.status === "ready" ? (
          children(section.data)
        ) : (
          <ErrorState {...describeError(section.error, `${title} did not load`)} retry={<RetryButton />} />
        )}
      </div>
    </Card>
  );
}
