import { type FullNameResult, fullNameResultSchema, operationErrorSchema } from "@monara/contracts";

/** Saves the User's full name. Throws with a message the User can read. */
export async function saveFullName(
  fullName: string,
  signal?: AbortSignal,
): Promise<FullNameResult> {
  let response: Response;
  try {
    response = await fetch("/api/profile/full-name", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName }),
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
  } catch {
    throw new Error("Could not reach Monara. Check your connection and try again.");
  }
  if (!response.ok) {
    const failure = operationErrorSchema.safeParse(await response.json().catch(() => null));
    throw new Error(
      failure.success ? failure.data.message : "Your name could not be saved. Try again.",
    );
  }
  const result = fullNameResultSchema.safeParse(await response.json().catch(() => null));
  if (!result.success) throw new Error("Your name could not be saved. Try again.");
  return result.data;
}
