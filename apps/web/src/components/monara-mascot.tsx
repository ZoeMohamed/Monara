import { useId } from "react";
import { avatarEyePaths, avatarHeadPath } from "@/data/avatar-geometry";
import styles from "./monara-mascot.module.css";

/** The same blue cat as the logo and onboarding, with poses for larger placements. */
export function MonaraMascot({
  className = "",
  pose = "still",
}: {
  className?: string;
  pose?: "still" | "peek" | "curious" | "hello";
}) {
  const clipId = useId();

  return (
    <svg
      aria-hidden
      className={`${styles.mascot} ${className}`}
      data-pose={pose}
      fill="none"
      focusable="false"
      height={80}
      viewBox="-60 -40 850 790"
      width={80}
    >
      <g className={styles.character}>
        <g className={styles.head}>
          {avatarEyePaths.map((path) => (
            <path d={path} fill="var(--surface)" key={path} />
          ))}
          <path d={avatarHeadPath} fill="var(--brand)" fillRule="evenodd" />
          <defs>
            <clipPath id={clipId}>
              {avatarEyePaths.map((path) => (
                <path d={path} key={path} />
              ))}
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <path className={styles.lids} d="M120 240H440V460H120Z" fill="var(--brand)" />
          </g>
        </g>
      </g>
    </svg>
  );
}
