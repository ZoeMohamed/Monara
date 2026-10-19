"use client";

import { Button } from "@monara/ui";
import Image from "next/image";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { Logo } from "@/components/logo";
import { MonaraMascot } from "@/components/monara-mascot";

import styles from "./sign-in-screen.module.css";

type SignInScreenProps = {
  available?: boolean;
  error?: string;
  next: string;
};

const benefits: { icon: IconName; text: string }[] = [
  { icon: "mail", text: "Gmail receipts, ready for review" },
  { icon: "check", text: "Review the details that need a second look" },
  { icon: "chat", text: "Ask “can I afford it?” any time" },
];

function GoogleMark() {
  return (
    <svg aria-hidden className={styles.google} viewBox="0 0 24 24">
      <path
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function SignInScreen({ available = true, error, next }: SignInScreenProps) {
  return (
    <main className={styles.page}>
      <section aria-hidden className={styles.scene}>
        <Image
          alt=""
          className={styles.landscape}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          src="/scenes/overview-landscape.webp"
        />
        <div className={styles.shade} />
        <div className={styles.preview}>
          <MonaraMascot className={styles.mascot} pose="peek" />
          <div className={styles.previewCard}>
            <span>October</span>
            <strong>
              <small>Rp</small>397,490
            </strong>
            <span className={styles.previewBar}>
              <span />
            </span>
            <span>Rp3.3m budget left · Rp157k a day</span>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.brand}>
          <Logo />
        </div>
        <h1>No more scattered spending.</h1>
        <p className={styles.lede}>
          A little clarity. More room to live. Track your spending and plan what comes next.
        </p>
        <ul className={styles.benefits}>
          {benefits.map((benefit) => (
            <li key={benefit.text}>
              <span aria-hidden>
                <Icon name={benefit.icon} strokeWidth={2} />
              </span>
              {benefit.text}
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <Link className={styles.demo} href="/demo">
            Try the demo
            <Icon name="arrow" strokeWidth={2.2} />
          </Link>
          <form action="/auth/sign-in" method="post">
            <input name="next" type="hidden" value={next} />
            <Button
              className={styles.googleButton}
              isDisabled={!available}
              type="submit"
              variant="outline"
            >
              <GoogleMark />
              Continue with Google
            </Button>
          </form>
        </div>

        {!available ? (
          <p className={styles.note} role="status">
            Sign-in is unavailable right now. The demo works without an account.
          </p>
        ) : error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.note}>
            No account needed to explore. Gmail access is your choice after sign-in.
          </p>
        )}
      </section>
    </main>
  );
}
