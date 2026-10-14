import { useId } from "react";

import styles from "./monara-mascot.module.css";

// The supplied app icon's cat mark: notched left ear and two blue arch eyes.
export function MonaraMascot({ className = "" }: { className?: string }) {
  const fillId = useId();

  return (
    <svg
      aria-hidden
      className={`${styles.mascot} ${className}`}
      fill="none"
      focusable="false"
      height={80}
      viewBox="0 0 400 400"
      width={80}
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={fillId}
          x1="105"
          x2="280"
          y1="40"
          y2="355"
        >
          <stop stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#eefbff" />
          <stop offset="1" stopColor="#d0f0ff" />
        </linearGradient>
      </defs>
      <path
        d="M72 117 79 36C80 20 92 15 104 27L142 63 105 79 114 98C158 72 214 75 267 101L350 53C364 44 377 54 373 71L346 239C336 310 282 354 218 355 139 362 74 327 42 271 12 216 29 159 72 117Z"
        fill={`url(#${fillId})`}
        stroke="#c0e4f4"
        strokeWidth="1.5"
      />
      <path
        d="M103 174a23 23 0 0 1 46 0v49h-46Zm80 0a23 23 0 0 1 46 0v49h-46Z"
        fill="var(--accent)"
        transform="rotate(9 165 180)"
      />
    </svg>
  );
}
