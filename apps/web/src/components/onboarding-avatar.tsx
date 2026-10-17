import { type CSSProperties, useId } from "react";
import { avatarEyeCenters, avatarEyePaths, avatarHeadPath } from "@/data/avatar-geometry";
import styles from "./onboarding-avatar.module.css";

export type AvatarScene = "connect" | "scan" | "found" | "empty" | "import" | "done" | "name";

const stage = { width: 360, height: 220 } as const;
/** The name step shares its row with a speech bubble, so its stage is narrower. */
const nameStage = { width: 190, height: 200 } as const;
/** The logo is 728 by 703; it is drawn at this scale and centred on `cat`. */
const catScale = 0.21;

function Cat({ x, y }: { x: number; y: number }) {
  const clipId = useId();
  return (
    <g transform={`translate(${x} ${y}) scale(${catScale}) translate(-364 -351)`}>
      <g className={styles.catBody}>
        <path d={avatarHeadPath} fill="var(--brand)" fillRule="evenodd" />
        <clipPath id={clipId}>
          {avatarEyePaths.map((path) => (
            <path d={path} key={path} />
          ))}
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          {avatarEyeCenters.map((eye) => (
            <rect
              className={styles.lid}
              fill="var(--brand)"
              height="230"
              key={eye.x}
              width="170"
              x={eye.x - 85}
              y={eye.y - 125}
            />
          ))}
        </g>
      </g>
    </g>
  );
}

function Sparkle({
  x,
  y,
  delay,
  size = 9,
}: {
  x: number;
  y: number;
  delay: string;
  size?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        className={styles.sparkle}
        d={`M0 ${-size} Q0 0 ${size} 0 Q0 0 0 ${size} Q0 0 ${-size} 0 Q0 0 0 ${-size}Z`}
        fill="var(--warning)"
        style={{ animationDelay: delay }}
      />
    </g>
  );
}

function Receipt({
  x,
  y,
  delay,
  className,
  dx = 0,
}: {
  x: number;
  y: number;
  delay: string;
  className: string;
  dx?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        className={className}
        style={{ animationDelay: delay, "--dx": `${dx}px` } as CSSProperties}
      >
        <rect fill="#fff" height="26" rx="5" stroke="var(--border)" width="20" x="-10" y="-13" />
        <rect fill="var(--brand)" height="3" opacity=".85" rx="1.5" width="12" x="-6" y="-7" />
        <rect fill="var(--line-strong)" height="3" rx="1.5" width="9" x="-6" y="-1" />
        <circle cx="0" cy="8" fill="var(--warning)" r="2.4" />
      </g>
    </g>
  );
}

function Envelope() {
  return (
    <g transform="translate(54 74)">
      <g className={styles.envelope}>
        <rect
          fill="#fff"
          height="50"
          rx="9"
          stroke="var(--border)"
          strokeWidth="2"
          width="70"
          x="-35"
          y="-25"
        />
        <path
          d="M-30 -17 L0 6 L30 -17"
          fill="none"
          stroke="#ea4335"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5.5"
        />
        <path
          d="M-30 -17 V19 M30 -17 V19"
          fill="none"
          stroke="#4285f4"
          strokeLinecap="round"
          strokeWidth="5.5"
        />
      </g>
    </g>
  );
}

function ConnectScene() {
  return (
    <>
      <path
        className={styles.link}
        d="M96 78 C 126 66, 140 92, 158 108"
        fill="none"
        stroke="var(--brand)"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <Envelope />
      <Receipt className={styles.flyingReceipt} delay="0s" x={92} y={76} />
      <Receipt className={styles.flyingReceipt} delay="1.3s" x={92} y={76} />
      <Receipt className={styles.flyingReceipt} delay="2.6s" x={92} y={76} />
      <Cat x={236} y={118} />
      <Sparkle delay="0s" size={10} x={300} y={46} />
      <Sparkle delay="0.7s" size={7} x={324} y={80} />
    </>
  );
}

const bankDots = ["var(--brand)", "var(--warning)", "var(--success)"] as const;

function ScanScene() {
  return (
    <>
      <Cat x={116} y={120} />
      {bankDots.map((color, index) => (
        <g key={color} transform={`translate(246 ${42 + index * 54})`}>
          <g className={styles.mail} style={{ animationDelay: `${index * 1.2}s` }}>
            <rect
              fill="#fff"
              height="40"
              rx="9"
              stroke="var(--border)"
              strokeWidth="2"
              width="84"
              x="-42"
              y="-20"
            />
            <circle
              className={styles.bankDot}
              cx="-22"
              cy="0"
              fill={color}
              r="9"
              style={{ animationDelay: `${index * 1.2}s` }}
            />
            <rect fill="var(--line-strong)" height="5" rx="2.5" width="36" x="-6" y="-8" />
            <rect fill="var(--border)" height="5" rx="2.5" width="26" x="-6" y="3" />
          </g>
        </g>
      ))}
      <g transform="translate(262 42)">
        <g className={styles.loupe}>
          <circle
            cx="0"
            cy="0"
            fill="rgb(255 255 255 / 55%)"
            r="19"
            stroke="var(--foreground)"
            strokeWidth="5"
          />
          <path
            d="M14 14 L30 30"
            stroke="var(--foreground)"
            strokeLinecap="round"
            strokeWidth="7"
          />
          <path
            d="M-9 -6 A11 11 0 0 1 -2 -12"
            fill="none"
            opacity=".8"
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </g>
      </g>
    </>
  );
}

function ImportScene() {
  return (
    <>
      <Receipt className={styles.fallingReceipt} delay="0s" dx={30} x={150} y={28} />
      <Receipt className={styles.fallingReceipt} delay="0.8s" dx={-38} x={218} y={22} />
      <Receipt className={styles.fallingReceipt} delay="1.6s" dx={-4} x={184} y={14} />
      <Cat x={180} y={128} />
      {[0, 1].map((index) => (
        <g key={index} transform="translate(252 112)">
          <g className={styles.coin} style={{ animationDelay: `${0.55 + index * 1.2}s` }}>
            <circle fill="var(--warning)" r="12" stroke="#fff" strokeWidth="2.5" />
            <path
              d="M-5 0 H5 M0 -5 V5"
              stroke="var(--warning-foreground)"
              strokeLinecap="round"
              strokeWidth="2.6"
            />
          </g>
        </g>
      ))}
    </>
  );
}

function FoundScene({ done }: { done: boolean }) {
  return (
    <>
      <Cat x={180} y={118} />
      <Sparkle delay="0s" size={11} x={96} y={60} />
      <Sparkle delay="0.5s" size={8} x={268} y={52} />
      <Sparkle delay="1s" size={9} x={286} y={128} />
      <Sparkle delay="1.5s" size={7} x={80} y={140} />
      {done ? (
        <g transform="translate(262 78)">
          <g className={styles.badge}>
            <circle fill="var(--success)" r="17" stroke="#fff" strokeWidth="3" />
            <path
              d="M-7 0 L-2 6 L8 -6"
              fill="none"
              stroke="#fff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4"
            />
          </g>
        </g>
      ) : null}
    </>
  );
}

/** The cat talks: it nods along while its bubble (drawn beside it) types out. */
function NameScene() {
  return (
    <>
      <Cat x={96} y={122} />
      <Sparkle delay="0.4s" size={8} x={34} y={52} />
      <Sparkle delay="1.2s" size={6} x={158} y={170} />
    </>
  );
}

function EmptyScene() {
  return (
    <>
      <Cat x={170} y={122} />
      <g transform="translate(262 62)">
        <g className={styles.question}>
          <circle fill="#fff" r="22" stroke="var(--border)" strokeWidth="2" />
          <text fill="var(--brand)" fontSize="28" fontWeight="800" textAnchor="middle" y="10">
            ?
          </text>
        </g>
      </g>
    </>
  );
}

/**
 * The Monara cat, acting out what onboarding is doing. Decorative: the text beside it
 * says the same thing. Motion stops for people who ask for less of it.
 */
export function OnboardingAvatar({
  scene,
  compact = false,
  tight = false,
}: {
  scene: AvatarScene;
  compact?: boolean;
  /** Crops the wide stage down to the cat, for small spots beside text. */
  tight?: boolean;
}) {
  const box = scene === "name" ? nameStage : stage;
  const viewBox = tight && scene !== "name" ? "92 0 176 200" : `0 0 ${box.width} ${box.height}`;
  return (
    <svg
      aria-hidden
      className={styles.stage}
      data-compact={compact}
      data-scene={scene}
      focusable="false"
      viewBox={viewBox}
    >
      {scene === "name" ? <NameScene /> : null}
      {scene === "connect" ? <ConnectScene /> : null}
      {scene === "scan" ? <ScanScene /> : null}
      {scene === "import" ? <ImportScene /> : null}
      {scene === "found" || scene === "done" ? <FoundScene done={scene === "done"} /> : null}
      {scene === "empty" ? <EmptyScene /> : null}
    </svg>
  );
}

/**
 * The plain cat, still, for small spots where motion would only distract. A green check
 * badge says the work is done.
 */
export function OnboardingMark({ done = false }: { done?: boolean }) {
  return (
    <svg aria-hidden className={styles.mark} focusable="false" viewBox="0 0 730 704">
      <path d={avatarHeadPath} fill="var(--brand)" fillRule="evenodd" />
      {done ? (
        <g transform="translate(640 96)">
          <circle fill="var(--success)" r="112" stroke="#fff" strokeWidth="26" />
          <path
            d="M-48 4 L-14 40 L50 -34"
            fill="none"
            stroke="#fff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="26"
          />
        </g>
      ) : null}
    </svg>
  );
}
