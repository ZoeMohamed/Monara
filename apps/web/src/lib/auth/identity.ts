export interface AuthenticatedProfile {
  /** Opaque identity-specific key for browser setup, never a resource authorization key. */
  setupKey?: string;
  displayName: string;
  email: string | null;
  initials: string;
  /**
   * The shared reviewer account, set up by an administrator with seeded records. It signs in
   * with a password, skips Gmail setup, and cannot be deleted. Absent for everyone else.
   */
  demoAccount?: true;
}

export interface AuthenticatedIdentity extends AuthenticatedProfile {
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
  return initials.toLocaleUpperCase("en-US") || "M";
}

/** Creates the minimum trusted identity used by server-rendered Monara pages. */
export function identityFromVerifiedClaims(claims: unknown): AuthenticatedIdentity | null {
  if (!isRecord(claims)) return null;

  const id = nonEmptyString(claims.sub);
  const appMetadata = isRecord(claims.app_metadata) ? claims.app_metadata : {};
  const providers = Array.isArray(appMetadata.providers) ? appMetadata.providers : [];
  const hasGoogleProvider =
    appMetadata.provider === "google" || providers.some((provider) => provider === "google");
  // Only an administrator can write app_metadata, so a password session counts as the
  // reviewer account only when the flag was set by the seed script, never by a visitor.
  const demoAccount =
    appMetadata.monara_demo_account === true &&
    (appMetadata.provider === "email" || providers.some((provider) => provider === "email"));
  if (
    !id ||
    claims.aud !== "authenticated" ||
    claims.role !== "authenticated" ||
    claims.is_anonymous === true ||
    !(hasGoogleProvider || demoAccount)
  ) {
    return null;
  }

  const email = nonEmptyString(claims.email);
  const metadata = isRecord(claims.user_metadata) ? claims.user_metadata : {};
  const displayName =
    nonEmptyString(metadata.full_name) ??
    nonEmptyString(metadata.name) ??
    email?.split("@")[0] ??
    "Monara User";

  return {
    displayName,
    email,
    id,
    initials: initialsFor(displayName),
    ...(demoAccount ? { demoAccount: true as const } : {}),
  };
}

/** Removes the server-only ownership key before sending profile data to a Client Component. */
export function profileFromIdentity(identity: AuthenticatedIdentity): AuthenticatedProfile {
  return {
    displayName: identity.displayName,
    email: identity.email,
    initials: identity.initials,
    ...(identity.demoAccount ? { demoAccount: true as const } : {}),
  };
}
