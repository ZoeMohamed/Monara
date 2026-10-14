import type { ReactNode } from "react";

const glyphs = {
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="m8 4 12 8-12 8Z" />,
  reports: (
    <>
      <path d="M4 20h17M7 16v-5M12 16V4M17 16V8" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  transactions: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  budgets: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9v9Z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15Z" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5h16v11H9l-5 4Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  check: (
    <>
      <path d="m5 12 4 4L19 6" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </>
  ),
  "chevron-left": (
    <>
      <path d="m15 6-6 6 6 6" />
    </>
  ),
  "chevron-right": (
    <>
      <path d="m9 6 6 6-6 6" />
    </>
  ),
  send: (
    <>
      <path d="M12 19V5m0 0-6 6m6-6 6 6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  calendar: (
    <>
      <rect height="16" rx="3" width="18" x="3" y="5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M10.6 5.6A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.3A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.7-1.3" />
      <path d="m4 4 16 16M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  "trend-up": <path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  "trend-down": <path d="M12 5v14m0 0 6-6m-6 6-6-6" />,
  inbox: (
    <>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
    </>
  ),
  mail: (
    <>
      <rect height="14" rx="2.5" width="18" x="3" y="5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  compose: (
    <>
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 8 16l1.2-4Z" />
    </>
  ),
  sparkle: (
    <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />
  ),
  pulse: <path d="M3 12h4l2.5-6 5 12 2.5-6H21" />,
  pie: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9Z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15Z" />
    </>
  ),
  food: (
    <>
      <path d="M4 11h16a8 8 0 0 1-16 0Z" />
      <path d="M9 3c-1 1.5 1 2.5 0 4M13 3c-1 1.5 1 2.5 0 4M8 21h8" />
    </>
  ),
  transport: (
    <>
      <path d="M5 16V9.5L7 5h10l2 4.5V16Z" />
      <path d="M5 16v2.5M19 16v2.5M5 11h14" />
      <circle cx="8.5" cy="13.5" r=".5" />
      <circle cx="15.5" cy="13.5" r=".5" />
    </>
  ),
  shopping: (
    <>
      <path d="M5 8h14l-1 12H6Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  digital: (
    <>
      <rect height="18" rx="3" width="12" x="6" y="3" />
      <path d="M11 17.5h2" />
    </>
  ),
  bills: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h3" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="3" />,
  whatsapp: (
    <>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8Z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2Z" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5M12 16.5v.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof glyphs;

type IconProps = {
  name: IconName;
  className?: string;
  strokeWidth?: number;
};

export function Icon({ name, className = "h-5 w-5", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
    >
      {glyphs[name]}
    </svg>
  );
}
