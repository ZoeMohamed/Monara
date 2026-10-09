"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/icon";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function subscribeToDisplayMode(callback: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [wasInstalled, setWasInstalled] = useState(false);
  const isStandalone = useSyncExternalStore(subscribeToDisplayMode, getStandaloneMode, () => false);
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setWasInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone || wasInstalled) {
    return (
      <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-success-soft px-3.5 text-xs font-semibold text-accent-strong">
        <Icon className="h-4 w-4" name="check" /> Terpasang
      </span>
    );
  }

  const install = async () => {
    if (!installEvent) {
      setShowHelp(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  };

  return (
    <>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 text-xs font-semibold text-ink transition-colors hover:border-accent hover:text-accent-strong sm:text-sm"
        onClick={install}
        type="button"
      >
        <Icon className="h-4 w-4" name="download" />
        <span className="hidden sm:inline">Install FINCOUNTANT</span>
        <span className="sm:hidden">Install</span>
      </button>

      {showHelp ? (
        <div
          aria-labelledby="install-title"
          aria-modal="true"
          className="fixed inset-0 z-[80] grid place-items-end bg-ink/55 p-2 backdrop-blur-[2px] sm:place-items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowHelp(false);
          }}
          role="dialog"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-modal sm:p-7">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold text-accent">Install PWA</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-ink" id="install-title">
                  Taruh FINCOUNTANT di layar utama.
                </h2>
              </div>
              <button
                aria-label="Tutup panduan install"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-muted transition-colors hover:bg-soft hover:text-ink"
                onClick={() => setShowHelp(false)}
                type="button"
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted">
              {isIOS
                ? "Di Safari, ketuk tombol Share lalu pilih Add to Home Screen."
                : "Buka menu browser lalu pilih Install app atau Add to Home screen."}
            </p>
            <button
              className="mt-6 min-h-12 w-full rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
              onClick={() => setShowHelp(false)}
              type="button"
            >
              Mengerti
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
