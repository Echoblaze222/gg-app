import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export interface LinkButtonProps extends Omit<ComponentProps<typeof Link>, "children"> {
  variant?: "primary" | "secondary" | "accent" | "quiet";
  size?: "md" | "lg";
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
}

/**
 * A navigation link drawn as a pill button. Use it when the action is "go to a page".
 * Use Button when the action changes something (submit, pay, save), because only Button has loading, success and failure states.
 */
export function LinkButton({
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      {...rest}
      className={cx("btn", variant !== "primary" && `btn--${variant}`, size === "lg" && "btn--lg", className)}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  );
}
