import type { ComponentProps, ElementType, ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps extends Omit<ComponentProps<"div">, "children"> {
  /** `surface` is a white card. `ink` is the black hero card. */
  tone?: "surface" | "ink";
  padding?: "md" | "lg";
  as?: Extract<ElementType, "div" | "section" | "article">;
  children: ReactNode;
}

export function Card({ tone = "surface", padding = "md", as: Tag = "div", className, children, ...rest }: CardProps) {
  return (
    <Tag {...rest} className={cx("card", `card--${tone}`, padding === "lg" && "card--lg", className)} data-surface={tone === "ink" ? "ink" : undefined}>
      {children}
    </Tag>
  );
}
