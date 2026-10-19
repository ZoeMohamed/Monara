/** Shared by live replies, private history validation, and the history HTTP boundary. */
export const chatReplyMaxCharacters = 12_000;
export const chatReplyMaxActions = 20;
export const chatHistoryMaxBytes = 131_072;

/**
 * Pretty JSON conservatively includes more separator whitespace than PostgreSQL
 * jsonb text, as well as the compact JSON sent over HTTP. Count encoded bytes,
 * because a character limit alone does not bound escaped or non-ASCII content.
 */
export function chatStorageByteLength(value: unknown): number {
  let bytes = 0;
  for (const character of JSON.stringify(value, null, 1) ?? "") {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
