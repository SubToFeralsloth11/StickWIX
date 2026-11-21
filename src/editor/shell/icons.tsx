import type { ReactNode } from 'react';

/** Stroke paths (24×24 grid) for the editor chrome. No emoji: plain, colourable line icons. */
const PATHS: Record<string, ReactNode> = {
  art: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
    </>
  ),
  presets: (
    <>
      <path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z" />
      <path d="M4.8 7.9L12 12l7.2-4.1M12 12v8.3" />
    </>
  ),
  tiles: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  scenes: (
    <>
      <rect x="6.5" y="3.5" width="14" height="11" rx="2.5" />
      <path d="M3.5 8v9.5a3 3 0 003 3H16" />
    </>
  ),
  rules: (
    <>
      <path d="M4 6.5h6M4 12h10M4 17.5h7" />
      <path d="M15.5 4.5l4 2-4 2z" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  values: (
    <>
      <path d="M9.5 4l-2 16M16.5 4l-2 16M4.5 9h15M4 15h15" />
    </>
  ),
  screen: (
    <>
      <rect x="3" y="4.5" width="18" height="13" rx="2.5" />
      <path d="M6.5 8h5M6.5 11h3M9 21h6" />
      <rect x="13.5" y="11.5" width="4.5" height="3" rx="1" />
    </>
  ),
  game: (
    <>
      <path d="M4 7h4M12 7h8M4 17h10M18 17h2M4 12h1M9 12h11" />
      <circle cx="10" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
      <circle cx="7" cy="12" r="2" />
    </>
  ),
  warnings: (
    <>
      <path d="M12 4l8.5 15h-17z" />
      <path d="M12 10v4M12 16.8v.2" />
    </>
  ),
  inspect: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  undo: <path d="M9 7L4.5 11.5 9 16M5 11.5h9.5a5 5 0 010 10H12" />,
  redo: <path d="M15 7l4.5 4.5L15 16M19 11.5H9.5a5 5 0 000 10H12" />,
  play: <path d="M8 5.5v13l10-6.5z" fill="currentColor" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevronLeft: <path d="M14.5 6l-6 6 6 6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.5h11l-2.5 4 2.5 4H6" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9" />
    </>
  ),
  kind: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-4 3.7-6 7-6s6.2 2 7 6" />
    </>
  ),
  action: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  section: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M9 4v16" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.section}
    </svg>
  );
}
