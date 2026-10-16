import {
  operationErrorSchema,
  type StartWhatsAppLinkResult,
  type WhatsAppLinkStatus,
  whatsAppLinkStatusSchema,
} from "@monara/contracts";

const LINK_URL = "/api/whatsapp/link";

export type WhatsAppLinkView =
  | { step: "loading" }
  | { step: "unavailable"; message: string }
  | { step: "ready"; link: WhatsAppLinkStatus }
  | { step: "code"; challenge: StartWhatsAppLinkResult };

async function readLink(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = operationErrorSchema.safeParse(body);
    throw new Error(error.success ? error.data.message : "WhatsApp linking isn't available.");
  }
  return body;
}

/** The signed-in User's link, or why it cannot be shown. */
export async function loadWhatsAppLink(signal?: AbortSignal): Promise<WhatsAppLinkView> {
  try {
    const link = whatsAppLinkStatusSchema.parse(
      await readLink(await fetch(LINK_URL, { cache: "no-store", signal })),
    );
    return { step: "ready", link };
  } catch (error) {
    return {
      step: "unavailable",
      message: error instanceof Error ? error.message : "WhatsApp linking isn't available.",
    };
  }
}

/** Starts linking (POST) or unlinks (DELETE). Throws with a message the User can read. */
export async function sendWhatsAppLink(method: "POST" | "DELETE", body?: unknown) {
  return readLink(
    await fetch(LINK_URL, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
