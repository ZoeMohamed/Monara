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
      <span className="inline-flex items-center gap-2 rounded-full bg-[#e1efe5] px-3 py-2 text-xs font-semibold text-[#17603f]">
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
        className="inline-flex items-center gap-2 rounded-full border border-[#cbd8ce] bg-white px-3.5 py-2 text-xs font-semibold text-[#1d3a2f] shadow-sm transition hover:border-[#1b7a50] hover:text-[#17603f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b7a50] sm:text-sm"
        onClick={install}
        type="button"
      >
        <Icon className="h-4 w-4" name="download" />
        <span className="hidden sm:inline">Install FIN</span>
        <span className="sm:hidden">Install</span>
      </button>

      {showHelp ? (
        <div
          aria-labelledby="install-title"
          aria-modal="true"
          className="fixed inset-0 z-[80] grid place-items-end bg-[#10271fb3] p-3 backdrop-blur-sm sm:place-items-center"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowHelp(false);
          }}
          role="dialog"
        >
          <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1b7a50]">Install PWA</p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]" id="install-title">
                  Taruh FIN di layar utama.
                </h2>
              </div>
              <button
                aria-label="Tutup panduan install"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dfe7e1] text-[#617068]"
                onClick={() => setShowHelp(false)}
                type="button"
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-[#617068]">
              {isIOS
                ? "Di Safari, ketuk tombol Share lalu pilih Add to Home Screen."
                : "Buka menu browser lalu pilih Install app atau Add to Home screen."}
            </p>
            <button
              className="mt-6 w-full rounded-2xl bg-[#173b2e] px-5 py-3.5 text-sm font-semibold text-white"
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
