export type IconName =
  | "home"
  | "transactions"
  | "insights"
  | "account"
  | "plus"
  | "shield"
  | "search"
  | "bell"
  | "download"
  | "close"
  | "check"
  | "arrow"
  | "budget"
  | "calendar"
  | "car"
  | "chevron"
  | "edit"
  | "filter"
  | "food"
  | "health"
  | "mail"
  | "more"
  | "phone"
  | "shopping"
  | "sparkles"
  | "wallet"
  | "tools"
  | "bank"
  | "credit"
  | "clock";

type IconProps = {
  name: IconName;
  className?: string;
  strokeWidth?: number;
};

export function Icon({ name, className = "h-5 w-5", strokeWidth = 1.8 }: IconProps) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "transactions":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case "insights":
      return (
        <svg {...common}>
          <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14m-5-5 5 5-5 5" />
        </svg>
      );
    case "budget":
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2Z" />
          <path d="M4 7h16M15 12h5" />
          <circle cx="15" cy="12" r="1" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect height="17" rx="2" width="18" x="3" y="4" />
          <path d="M8 2v4M16 2v4M3 9h18" />
        </svg>
      );
    case "car":
      return (
        <svg {...common}>
          <path d="m5 17-1-1v-5l2-5h12l2 5v5l-1 1M6 11h12" />
          <circle cx="7" cy="16" r="1.5" />
          <circle cx="17" cy="16" r="1.5" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...common}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
      );
    case "food":
      return (
        <svg {...common}>
          <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3v18M17 3c3 3 3 8 0 10" />
        </svg>
      );
    case "health":
      return (
        <svg {...common}>
          <path d="M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11Z" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect height="16" rx="2" width="20" x="2" y="4" />
          <path d="m3 6 9 7 9-7" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <rect height="20" rx="2" width="13" x="5.5" y="2" />
          <path d="M10 18h4" />
        </svg>
      );
    case "shopping":
      return (
        <svg {...common}>
          <path d="M5 8h14l-1 13H6ZM9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 6a2 2 0 0 1 2-2h12v16H6a2 2 0 0 1-2-2ZM4 8h14" />
          <path d="M14 12h7v5h-7a2.5 2.5 0 0 1 0-5Z" />
        </svg>
      );
    case "tools":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0 5-5L18 9l-3-3Z" />
        </svg>
      );
    case "bank":
      return (
        <svg {...common}>
          <path d="m3 9 9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
        </svg>
      );
    case "credit":
      return (
        <svg {...common}>
          <rect height="15" rx="2" width="20" x="2" y="5" />
          <path d="M2 10h20M6 16h4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
  }
}
