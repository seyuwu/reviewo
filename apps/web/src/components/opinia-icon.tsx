interface OpiniaIconProps {
  className?: string;
  name:
    | "battle"
    | "bell"
    | "extension"
    | "fire"
    | "gamepad"
    | "help"
    | "message"
    | "objects"
    | "search"
    | "sparkle"
    | "spotlight"
    | "thumb"
    | "trophy";
}

export function OpiniaIcon({ className, name }: OpiniaIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      {renderIcon(name)}
    </svg>
  );
}

function renderIcon(name: OpiniaIconProps["name"]) {
  switch (name) {
    case "battle":
      return (
        <>
          <path d="m5 4 6 6-4 4-3-3 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="m19 4-6 6 4 4 3-3-4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="m9 13 2 2-5 5-2-2 5-5Zm6 0-2 2 5 5 2-2-5-5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M10 20h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      );
    case "extension":
      return (
        <path d="M8 3h3v3a2 2 0 1 0 4 0V3h3a3 3 0 0 1 3 3v3h-3a2 2 0 1 0 0 4h3v5a3 3 0 0 1-3 3h-5v-3a2 2 0 1 0-4 0v3H6a3 3 0 0 1-3-3v-3h3a2 2 0 1 0 0-4H3V6a3 3 0 0 1 3-3h2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      );
    case "fire":
      return (
        <path d="M13.2 2.8c.7 3.7-2.6 5.2-2.6 7.8 0 1.2.8 2 1.8 2 1.7 0 2.3-1.7 1.8-3.3 2.8 1.8 4.3 4.1 4.3 6.6A6.5 6.5 0 0 1 12 22a6.5 6.5 0 0 1-6.5-6.1c0-4.1 2.8-7.2 7.7-13.1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      );
    case "gamepad":
      return (
        <>
          <path
            d="M7.5 8.5h9a4.5 4.5 0 0 1 4.28 5.9l-.75 2.28a2.6 2.6 0 0 1-4.2 1.14l-1.6-1.32H9.77l-1.6 1.32a2.6 2.6 0 0 1-4.2-1.14l-.75-2.28A4.5 4.5 0 0 1 7.5 8.5Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path d="M7.5 11.5v4M5.5 13.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <circle cx="16.5" cy="12.5" fill="currentColor" r="1" />
          <circle cx="18.5" cy="14.5" fill="currentColor" r="1" />
        </>
      );
    case "help":
      return (
        <>
          <path d="M9.2 9a3 3 0 1 1 4.4 2.7c-1 .5-1.6 1.1-1.6 2.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M12 18h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        </>
      );
    case "message":
      return (
        <path
          d="M5 5.5h14A2.5 2.5 0 0 1 21.5 8v7A2.5 2.5 0 0 1 19 17.5h-7l-4.5 3v-3H5A2.5 2.5 0 0 1 2.5 15V8A2.5 2.5 0 0 1 5 5.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      );
    case "objects":
      return (
        <>
          <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="3" y="3" />
          <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="14" y="3" />
          <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="3" y="14" />
          <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" width="7" x="14" y="14" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </>
      );
    case "sparkle":
      return (
        <path d="M12 2c.7 5.5 4.5 9.3 10 10-5.5.7-9.3 4.5-10 10-.7-5.5-4.5-9.3-10-10 5.5-.7 9.3-4.5 10-10Z" fill="currentColor" />
      );
    case "spotlight":
      return (
        <>
          <path d="M9 18h6m-5 3h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          <path d="M8 14.5A6 6 0 1 1 16 14.5c-1 .8-1 1.5-1 1.5H9s0-.7-1-1.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      );
    case "thumb":
      return (
        <path d="M8 21H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h4m0 11h9.1a2 2 0 0 0 2-1.7l1-7A2 2 0 0 0 18.1 10H14l.7-3.5A3 3 0 0 0 11.8 3L8 10v11Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      );
    case "trophy":
      return (
        <>
          <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M8 6H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4M12 12v5m-3 4h6m-5-4h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      );
  }
}
