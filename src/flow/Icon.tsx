type IconName =
  | "sparkle"
  | "phone"
  | "receipt"
  | "headset"
  | "users"
  | "info"
  | "card"
  | "check"
  | "grid"
  | "compass"
  | "user"
  | "image"
  | "gift"
  | "stack"
  | "note"
  | "bolt"
  | "diamond"
  | "layers"
  | "undo"
  | "redo"
  | "search"
  | "fit"
  | "crop"
  | "layout"
  | "play"
  | "more"
  | "download"
  | "upload"
  | "x"
  | "plus"
  | "chevronDown"
  | "panelLeft"
  | "panelRight"
  | "link"
  | "sun"
  | "moon"
  | "grip";

const paths: Record<IconName, React.ReactNode> = {
  sparkle: (
    <>
      <path d="M12 3.2l1.9 5.1 5.1 1.9-5.1 1.9L12 17.2l-1.9-5.1L5 10.2l5.1-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.6" />
      <path d="M10.6 17.6h2.8" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z" />
      <path d="M9 8.5h6M9 12h6" />
    </>
  ),
  headset: (
    <>
      <path d="M4.5 13.5a7.5 7.5 0 0115 0" />
      <rect x="3.5" y="13" width="3.6" height="6" rx="1.6" />
      <rect x="16.9" y="13" width="3.6" height="6" rx="1.6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.6a3 3 0 010 5.8M17.4 14.9c2 .6 3.3 2.3 3.3 4.6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 10.8v5.4M12 8.1v.1" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.6" />
      <path d="M3 10h18M6.5 14.5h3" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.2 12.3l2.6 2.6 5-5.4" />
    </>
  ),
  grid: (
    <>
      <rect x="3.6" y="3.6" width="7" height="7" rx="2" />
      <rect x="13.4" y="3.6" width="7" height="7" rx="2" />
      <rect x="3.6" y="13.4" width="7" height="7" rx="2" />
      <rect x="13.4" y="13.4" width="7" height="7" rx="2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M5 20c0-3.4 3.1-5.6 7-5.6s7 2.2 7 5.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="M15.6 15.6l4 4" />
    </>
  ),
  image: (
    <>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.6" />
      <path d="M5.5 16.6l4.2-4.4 3 3.1 2.4-2.3 3.4 3.6" />
      <circle cx="9" cy="9.3" r="1.3" />
    </>
  ),
  gift: (
    <>
      <rect x="3.6" y="9" width="16.8" height="11" rx="2.2" />
      <path d="M3.6 13.2h16.8M12 9v11" />
      <path d="M12 9c-2.4 0-4.2-1-4.2-2.6C7.8 5.2 8.7 4.4 10 4.4c1.7 0 2 2.4 2 4.6zm0 0c2.4 0 4.2-1 4.2-2.6 0-1.2-.9-2-2.2-2-1.7 0-2 2.4-2 4.6z" />
    </>
  ),
  note: (
    <>
      <path d="M5 3.8h10.8L20 8v12.2H5z" />
      <path d="M15.8 3.8V8H20M8.4 12h8.2M8.4 15.4h6.2" />
    </>
  ),
  bolt: <path d="M13.2 2.8 5.8 13h5.4l-.4 8.2 7.5-10.5h-5.5z" />,
  diamond: <path d="m12 3 8 9-8 9-8-9z" />,
  layers: (
    <>
      <path d="m12 3.6 8.4 4.2-8.4 4.2L3.6 7.8z" />
      <path d="m3.6 12.2 8.4 4.2 8.4-4.2M3.6 16.4l8.4 4.2 8.4-4.2" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7H4v-5" />
      <path d="M4 7c2.2-2.5 5.1-4 8.5-4 4.8 0 8.5 3.8 8.5 8.5S17.3 20 12.5 20c-2.8 0-5.2-1.3-6.8-3.4" />
    </>
  ),
  redo: (
    <>
      <path d="M15 7h5v-5" />
      <path d="M20 7c-2.2-2.5-5.1-4-8.5-4C6.7 3 3 6.8 3 11.5S6.7 20 11.5 20c2.8 0 5.2-1.3 6.8-3.4" />
    </>
  ),
  fit: (
    <>
      <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
      <path d="M8 8h8v8H8z" />
    </>
  ),
  layout: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M9 4v16M9 10h11.5" />
    </>
  ),
  crop: (
    <>
      <path d="M6.5 2.5v15h15" />
      <path d="M2.5 6.5h15v15" />
    </>
  ),
  play: <path d="M8 4.5 19 12 8 19.5z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevronDown: <path d="m7 9 5 5 5-5" />,
  panelLeft: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  link: (
    <>
      <path d="m9.5 14.5 5-5" />
      <path d="M7.2 17.8H6a4 4 0 0 1 0-8h3M16.8 6.2H18a4 4 0 0 1 0 8h-3" />
    </>
  ),
  stack: (
    <>
      <path d="M12 3.6l8.4 4.2-8.4 4.2L3.6 7.8z" />
      <path d="M3.6 12.2l8.4 4.2 8.4-4.2M3.6 16.4l8.4 4.2 8.4-4.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.6 8.6 0 1 0 20.2 15.1z" />,
  grip: (
    <>
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
};

export function Icon({ name, size = 16, fallback }: { name?: string; size?: number; fallback?: string }) {
  const node = name ? paths[name as IconName] : undefined;
  if (!node) {
    return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{fallback ?? "•"}</span>;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {node}
    </svg>
  );
}
