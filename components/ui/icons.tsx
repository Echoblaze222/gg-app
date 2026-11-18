import type { ReactElement, SVGProps } from "react";

/** Small stroke icon set for navigation and controls. All decorative: the label next to them carries the meaning. */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Base({ children, ...rest }: IconProps & { children: ReactElement | ReactElement[] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v9h12v-9" />
  </Base>
);

export const WalletIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7.5A2.5 2.5 0 016.5 5H18v14H6.5A2.5 2.5 0 014 16.5v-9z" />
    <path d="M18 9.5h2v5h-2a2.5 2.5 0 010-5z" />
  </Base>
);

export const ReceiptIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
    <path d="M9 8h6M9 12h6" />
  </Base>
);

export const BellIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z" />
    <path d="M10 20.5a2 2 0 004 0" />
  </Base>
);

export const UserIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Base>
);

export const ShieldIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l7 3v5.5c0 4.2-2.8 7.4-7 9.5-4.2-2.1-7-5.3-7-9.5V6l7-3z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Base>
);

export const SupportIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 6h14v10H10l-4 3.5V16H5V6z" />
  </Base>
);

export const MenuIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const InboxIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 13l2.5-7h11L20 13v6H4v-6z" />
    <path d="M4 13h4.5l1 2.5h5l1-2.5H20" />
  </Base>
);
