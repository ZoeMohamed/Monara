"use client";

import { Button, Chip } from "@monara/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";

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
  const installEvent = useRef<BeforeInstallPromptEvent | null>(null);
  const installInProgress = useRef(false);
  const [showHelp, setShowHelp] = useState(false);
  const [wasInstalled, setWasInstalled] = useState(false);
  const isStandalone = useSyncExternalStore(subscribeToDisplayMode, getStandaloneMode, () => false);
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      installEvent.current = event as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      installEvent.current = null;
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
      <Chip className="h-auto gap-2 px-3 py-2 text-xs" color="success" variant="soft">
        <Icon className="h-4 w-4" name="check" />
        <Chip.Label>Installed</Chip.Label>
      </Chip>
    );
  }

  const install = async () => {
    if (installInProgress.current) return;
    const promptEvent = installEvent.current;
    if (!promptEvent) {
      setShowHelp(true);
      return;
    }
    installInProgress.current = true;
    installEvent.current = null;
    try {
      await Promise.all([promptEvent.prompt(), promptEvent.userChoice]);
    } catch {
      setShowHelp(true);
    } finally {
      installInProgress.current = false;
    }
  };

  return (
    <>
      <Button
        className="min-h-11 rounded-full border-border bg-surface px-3.5 text-xs text-foreground hover:border-accent hover:text-accent sm:text-sm"
        onPress={install}
        size="sm"
        type="button"
        variant="outline"
      >
        <Icon className="h-4 w-4" name="download" />
        <span className="hidden sm:inline">Install Monara</span>
        <span className="sm:hidden">Install</span>
      </Button>

      {showHelp ? (
        <ModalDialog labelledBy="install-title" onClose={() => setShowHelp(false)}>
          <div className="w-full max-w-md rounded-[1.75rem] bg-overlay p-6 text-overlay-foreground sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
                  Install PWA
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]" id="install-title">
                  Add Monara to your home screen.
                </h2>
              </div>
              <Button
                aria-label="Close installation guide"
                className="h-10 w-10 shrink-0 rounded-full border-border text-muted"
                isIconOnly
                onPress={() => setShowHelp(false)}
                type="button"
                variant="outline"
              >
                <Icon name="close" />
              </Button>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted">
              {isIOS
                ? "In Safari, tap Share, then choose Add to Home Screen."
                : "Open your browser menu, then choose Install app or Add to Home Screen."}
            </p>
            <Button
              className="mt-6 h-auto min-h-12 w-full rounded-2xl px-5 py-3.5 text-sm"
              onPress={() => setShowHelp(false)}
              type="button"
              variant="primary"
            >
              Got it
            </Button>
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}
