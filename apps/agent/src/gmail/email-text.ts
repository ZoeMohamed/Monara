import type { GmailMessageContent } from "@monara/integrations";

const MAX_BODY_CHARACTERS = 12_000;

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

/** Prefers the HTML body because bank and wallet receipts often keep amounts only in HTML tables. */
export function toEmailForExtraction(message: GmailMessageContent): EmailForExtraction | null {
  const source = message.html ? htmlToText(message.html) : (message.text ?? "");
  const body = collapseWhitespace(source).slice(0, MAX_BODY_CHARACTERS);
  if (!body && !message.subject) return null;
  return {
    receivedAt: message.receivedAt,
    from: message.from,
    subject: message.subject,
    body,
  };
}
