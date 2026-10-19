export const USER_DELETED_EVENT = "monara.user-deleted";
export const ACTIVE_USER_KEY = "monara.active-user";

/** SSR revokes/deletes the current cookies; reconnecting devices clear their stale copy here. */
export function clearExpiredAuthCookies(): void {
  for (const entry of document.cookie.split(";")) {
    const name = entry.trim().split("=")[0];
    if (!/^sb-.*-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(name)) continue;
    // biome-ignore lint/suspicious/noDocumentCookie: Supabase SSR cookies use document.cookie; the Cookie Store API is not universal.
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

/** Only Monara's User preferences are cleared. No other site's storage is touched. */
export function clearLocalUserState(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (
      key &&
      (key === "monara.hide-amounts" ||
        key === "monara.brand-logos.v1" ||
        key === ACTIVE_USER_KEY ||
        /^sb-.*-auth-token$/.test(key) ||
        key === "monara.tour.v1.live" ||
        /^monara\.onboarding\.v[12]\.live\./.test(key))
    )
      storage.removeItem(key);
  }
}

/** The hard navigation that follows also discards drafts, history and in-memory caches. */
export function leaveDeletedAccount(setupKey?: string): void {
  try {
    clearLocalUserState(window.localStorage);
    clearLocalUserState(window.sessionStorage);
    // Set/remove sends a scoped notification without leaving an identifier in storage.
    window.localStorage.setItem(USER_DELETED_EVENT, JSON.stringify({ setupKey }));
    window.localStorage.removeItem(USER_DELETED_EVENT);
  } catch {
    /* Browsers can refuse persistent storage. */
  }
  try {
    const channel = new BroadcastChannel(USER_DELETED_EVENT);
    channel.postMessage({ setupKey });
    channel.close();
  } catch {
    /* The server still rejects the old identity on the next request. */
  }
  window.location.replace("/account-deletion");
}
