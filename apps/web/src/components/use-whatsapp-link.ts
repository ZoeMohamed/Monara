"use client";

import type { StartWhatsAppLinkResult, WhatsAppLinkStatus } from "@monara/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadWhatsAppLink, sendWhatsAppLink, WhatsAppLinkClientError } from "@/lib/whatsapp/client";

type LinkState = {
  link: WhatsAppLinkStatus | null;
  challenge: StartWhatsAppLinkResult | null;
  phone: string;
  checking: boolean;
  mutation: "start" | "unlink" | null;
  error: string | null;
  phoneInvalid: boolean;
  notice: string | null;
  requiresSignIn: boolean;
  recoveryRequired: boolean;
  confirmUnlink: boolean;
  now: number;
};

/** Keeps a one-time code in memory while checking its authoritative link status. */
export function useWhatsAppLink() {
  const [state, setState] = useState<LinkState>(() => ({
    link: null,
    challenge: null,
    phone: "",
    checking: true,
    mutation: null,
    error: null,
    phoneInvalid: false,
    notice: null,
    requiresSignIn: false,
    recoveryRequired: false,
    confirmUnlink: false,
    now: Date.now(),
  }));
  const lifetime = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const mutating = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const recovery = useRef(false);

  const refresh = useCallback(async (manual = true) => {
    const page = lifetime.current;
    if (!page || page.signal.aborted || mutating.current || reading.current) return;
    const controller = new AbortController();
    reading.current = controller;
    const version = ++generation.current;
    const signal = AbortSignal.any([page.signal, controller.signal]);
    const current = () => !signal.aborted && generation.current === version;
    setState((previous) => ({ ...previous, checking: true }));
    try {
      const link = await loadWhatsAppLink({ signal });
      if (!current()) return;
      recovery.current = false;
      const now = Date.now();
      setState((previous) => {
        const keepCode =
          link.status === "pending" &&
          previous.challenge !== null &&
          Date.parse(previous.challenge.expiresAt) === Date.parse(link.expiresAt) &&
          previous.challenge.phoneLastFour === link.phoneLastFour &&
          Date.parse(link.expiresAt) > now;
        let notice = previous.notice;
        if (link.status === "verified" && previous.link?.status !== "verified") {
          notice = "Your number is linked.";
        } else if (previous.challenge && !keepCode) {
          notice =
            link.status === "pending" && Date.parse(link.expiresAt) <= now
              ? "Code expired. Get a new code."
              : "This code is no longer active. Get a new code.";
        } else if (manual && link.status === "pending" && Date.parse(link.expiresAt) > now) {
          notice = "Still waiting for the code from your number.";
        } else if (link.status === "none" && previous.link?.status === "verified") {
          notice = "WhatsApp unlinked.";
        }
        const clearError = manual || previous.recoveryRequired || previous.requiresSignIn;
        return {
          ...previous,
          link,
          challenge: keepCode ? previous.challenge : null,
          checking: false,
          error: clearError ? null : previous.error,
          phoneInvalid: clearError ? false : previous.phoneInvalid,
          requiresSignIn: false,
          recoveryRequired: false,
          confirmUnlink: link.status === "verified" && previous.confirmUnlink,
          notice,
          now,
        };
      });
    } catch (error) {
      if (!current()) return;
      recovery.current = true;
      const requiresSignIn =
        error instanceof WhatsAppLinkClientError && error.code === "UNAUTHENTICATED";
      setState((previous) => ({
        ...previous,
        ...(requiresSignIn
          ? {
              link: null,
              challenge: null,
              phone: "",
              notice: null,
              confirmUnlink: false,
              phoneInvalid: false,
            }
          : {}),
        checking: false,
        recoveryRequired: true,
        requiresSignIn,
        error:
          error instanceof WhatsAppLinkClientError
            ? error.message
            : "Your WhatsApp status could not be checked. Try again.",
      }));
    } finally {
      if (reading.current === controller) reading.current = null;
    }
  }, []);

  useEffect(() => {
    const page = new AbortController();
    lifetime.current = page;
    void refresh(false);
    return () => {
      page.abort();
      generation.current += 1;
      reading.current?.abort();
      mutating.current?.abort();
      reading.current = null;
      mutating.current = null;
      if (lifetime.current === page) lifetime.current = null;
    };
  }, [refresh]);

  const expiresAt = state.link?.status === "pending" ? state.link.expiresAt : null;
  const expired = expiresAt !== null && Date.parse(expiresAt) <= state.now;
  const watch =
    expiresAt !== null &&
    !expired &&
    !state.recoveryRequired &&
    !state.requiresSignIn &&
    state.mutation === null;

  useEffect(() => {
    if (!expiresAt || state.mutation !== null || state.recoveryRequired) return;
    const timer = setTimeout(
      () => {
        // A start can acquire the mutex before its render cleans up this timer.
        if (mutating.current || recovery.current) return;
        const now = Date.now();
        setState((previous) =>
          previous.link?.status === "pending" &&
          Date.parse(previous.link.expiresAt) === Date.parse(expiresAt)
            ? {
                ...previous,
                challenge: null,
                now,
                notice: "Code expired. Get a new code.",
              }
            : previous,
        );
        // One final read also catches a verification arriving just before expiry.
        void refresh(false);
      },
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, refresh, state.mutation, state.recoveryRequired]);

  useEffect(() => {
    if (!watch || !expiresAt) return;
    const timer = setInterval(() => {
      if (Date.now() < Date.parse(expiresAt)) void refresh(false);
    }, 5_000);
    const returned = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
    };
  }, [expiresAt, refresh, watch]);

  const change = async (kind: "start" | "unlink") => {
    const page = lifetime.current;
    if (
      !page ||
      page.signal.aborted ||
      mutating.current ||
      recovery.current ||
      state.requiresSignIn ||
      !state.link
    )
      return;
    if (kind === "unlink" && (!state.confirmUnlink || state.link.status !== "verified")) return;
    if (kind === "start" && state.link.status === "verified") return;
    const controller = new AbortController();
    mutating.current = controller;
    generation.current += 1;
    reading.current?.abort();
    reading.current = null;
    const signal = AbortSignal.any([page.signal, controller.signal]);
    const current = () => !signal.aborted && mutating.current === controller;
    setState((previous) => ({
      ...previous,
      mutation: kind,
      checking: false,
      error: null,
      phoneInvalid: false,
      notice: null,
    }));
    try {
      if (kind === "start") {
        const challenge = await sendWhatsAppLink("POST", { phone: state.phone }, { signal });
        if (!current()) return;
        setState((previous) => ({
          ...previous,
          link: {
            status: "pending",
            phoneLastFour: challenge.phoneLastFour,
            expiresAt: challenge.expiresAt,
          },
          challenge,
          notice: null,
          now: Date.now(),
        }));
      } else {
        await sendWhatsAppLink("DELETE", undefined, { signal });
        if (!current()) return;
        setState((previous) => ({
          ...previous,
          link: { status: "none" },
          challenge: null,
          phone: "",
          confirmUnlink: false,
          notice: "WhatsApp unlinked.",
        }));
      }
    } catch (error) {
      if (!current()) return;
      const uncertain = !(error instanceof WhatsAppLinkClientError) || error.actionMayHaveCompleted;
      recovery.current = uncertain;
      const requiresSignIn =
        error instanceof WhatsAppLinkClientError && error.code === "UNAUTHENTICATED";
      setState((previous) => ({
        ...previous,
        // A lost restart response may have replaced the earlier code.
        challenge: uncertain && kind === "start" ? null : previous.challenge,
        recoveryRequired: uncertain,
        requiresSignIn,
        ...(requiresSignIn
          ? {
              link: null,
              challenge: null,
              phone: "",
              notice: null,
              confirmUnlink: false,
            }
          : {}),
        phoneInvalid:
          error instanceof WhatsAppLinkClientError && error.code === "VALIDATION_FAILED",
        error:
          error instanceof WhatsAppLinkClientError
            ? error.message
            : "The WhatsApp change could not be confirmed. Check status before trying again.",
      }));
    } finally {
      if (current()) {
        mutating.current = null;
        setState((previous) => ({ ...previous, mutation: null }));
      }
    }
  };

  return {
    ...state,
    expired,
    refresh,
    start: () => change("start"),
    unlink: () => change("unlink"),
    editNumber: () => {
      if (!mutating.current && !recovery.current && !state.requiresSignIn) {
        setState((previous) => ({ ...previous, challenge: null, notice: null }));
      }
    },
    setPhone: (phone: string) => {
      if (!mutating.current) {
        setState((previous) => ({ ...previous, phone, phoneInvalid: false, error: null }));
      }
    },
    requestUnlink: () => {
      if (!mutating.current && !recovery.current) {
        setState((previous) => ({ ...previous, confirmUnlink: true, error: null }));
      }
    },
    cancelUnlink: () => {
      if (!mutating.current) setState((previous) => ({ ...previous, confirmUnlink: false }));
    },
  };
}
