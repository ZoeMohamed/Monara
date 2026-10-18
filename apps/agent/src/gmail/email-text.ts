import type { GmailMessageContent } from "@monara/integrations";

/**
 * Bank and wallet alerts put the amount, date, and merchant near the top, so the
 * model gets only the start of the body; most of a long email is boilerplate.
 */
const MAX_BODY_CHARACTERS = 4_000;
/** A footer marker this early is more likely part of the alert itself, so it is kept. */
const MIN_BODY_BEFORE_FOOTER = 400;
/**
 * Lines where the alert ends and the boilerplate begins: legal notices, unsubscribe
 * links, "do not reply" notes, and the start of a quoted earlier message.
 */
const FOOTER_START =
  /^(disclaimer|this (e-?mail|message) (was|is) (sent|generated|intended)|e-?mail ini (dikirim|merupakan|dihasilkan)|(please )?do not reply|mohon (untuk )?(tidak|jangan) membalas|jangan membalas|unsubscribe|berhenti berlangganan|copyright|hak cipta|©|-{2,}\s*original message|on .{4,80} wrote:|pada .{4,80} menulis:)/i;

/** The email as the extractor sees it. Held in memory only; never logged or stored. */
export interface EmailForExtraction {
  receivedAt: string;
  from: string | null;
  subject: string | null;
  body: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const value =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : " ";
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Converts email HTML to readable text, keeping table cells and rows apart. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)\s*>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, "\t")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text);
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Drops quoted reply lines and everything from the first footer marker on. */
function withoutBoilerplate(text: string): string {
  const kept: string[] = [];
  let length = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith(">")) continue;
    if (length >= MIN_BODY_BEFORE_FOOTER && FOOTER_START.test(line)) break;
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n");
}

/** Prefers the HTML body because bank and wallet receipts often keep amounts only in HTML tables. */
export function toEmailForExtraction(message: GmailMessageContent): EmailForExtraction | null {
  const source = message.html ? htmlToText(message.html) : (message.text ?? "");
  const body = withoutBoilerplate(collapseWhitespace(source)).slice(0, MAX_BODY_CHARACTERS);
  if (!body && !message.subject) return null;
  return {
    receivedAt: message.receivedAt,
    from: message.from,
    subject: message.subject,
    body,
  };
}
