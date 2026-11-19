export type IconName = "home" | "grid" | "bell" | "logout" | "arrow-up-right" | "wifi-off" | "refresh" | "card" | "inbox" | "lock" | "receipt";

const PATHS: Record<IconName, string[]> = {
  home: ["M3.5 9.5L10 4l6.5 5.5", "M5 8.75V16h10V8.75", "M8.5 16v-4h3v4"],
  grid: ["M3.5 3.5h5v5h-5z", "M11.5 3.5h5v5h-5z", "M3.5 11.5h5v5h-5z", "M11.5 11.5h5v5h-5z"],
  bell: ["M5 14.5h10l-1.25-2V9a3.75 3.75 0 00-7.5 0v3.5L5 14.5z", "M8.5 16.5a1.6 1.6 0 003 0"],
  logout: ["M8 3.75H5a1.25 1.25 0 00-1.25 1.25v10A1.25 1.25 0 005 16.25h3", "M12 6.5l3.5 3.5-3.5 3.5", "M15.25 10H8"],
  "arrow-up-right": ["M6 14l8-8", "M7.5 6H14v6.5"],
  "wifi-off": ["M3 3l14 14", "M5.5 8.25a8 8 0 012.75-1.5", "M12.5 7a8 8 0 012 1.25", "M8 11.5a4 4 0 012.5-.9", "M10 15.25v.01"],
  refresh: ["M15.5 9a5.5 5.5 0 10-1.1 4.4", "M15.75 4.5V9h-4.5"],
  card: ["M2.75 5.5h14.5v9H2.75z", "M2.75 8.5h14.5", "M5.5 12.25h3"],
  inbox: ["M3 11l2-6h10l2 6", "M3 11v4.5h14V11h-4.25a2.75 2.75 0 01-5.5 0H3z"],
  receipt: ["M5 2.75h10v14.5l-2.5-1.5-2.5 1.5-2.5-1.5L5 17.25z", "M7.75 7h4.5", "M7.75 10h4.5"],
  lock: ["M5.5 9h9v7h-9z", "M7.25 9V6.75a2.75 2.75 0 015.5 0V9"],
};

/** Line icons on a 20 px grid. Decorative by default: pair with visible text or pass `label`. */
export function Icon({ name, className, label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
