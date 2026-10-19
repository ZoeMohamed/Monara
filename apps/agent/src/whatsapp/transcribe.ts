// Speech to text for WhatsApp voice notes, through Azure AI Speech fast transcription
// with the MAI-Transcribe-2 model. The chat model cannot take audio, and WhatsApp
// sends OGG/Opus, which this endpoint accepts as uploaded.
import { z } from "zod";

const API_VERSION = "2025-10-15";
const MODEL = "mai-transcribe-2";
const TIMEOUT_MS = 30_000;
const MAX_PHRASES = 50;
const MAX_TRANSCRIPT = 2_000;

const responseSchema = z.object({
  combinedPhrases: z.array(z.object({ text: z.string() })).default([]),
});

/** Turns one voice note into text. Throws on any failure, reporting the status code only. */
export type Transcribe = (
  audio: { bytes: ArrayBuffer; contentType: string },
  phrases: string[],
) => Promise<string>;

/**
 * Builds the transcriber, or returns null when the Speech endpoint or key is missing so the
 * caller can say voice notes are not available instead of failing on every one.
 */
export function createTranscriber(config: {
  endpoint?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}): Transcribe | null {
  const endpoint = config.endpoint?.trim().replace(/\/+$/, "");
  const apiKey = config.apiKey?.trim();
  if (!endpoint || !apiKey || !endpoint.startsWith("https://")) return null;
  const send = config.fetch ?? fetch;

  return async (audio, phrases) => {
    const form = new FormData();
    form.append("audio", new Blob([audio.bytes], { type: audio.contentType }), "voice-note");
    form.append(
      "definition",
      JSON.stringify({
        // MAI-Transcribe-2 takes at most one locale; the app is English only.
        locales: ["en"],
        // The User's own account and merchant names, so "GoPay" is not heard as "Gopai".
        ...(phrases.length > 0 ? { phraseList: { phrases: phraseList(phrases) } } : {}),
        enhancedMode: {
          enabled: true,
          model: MODEL,
          modelOptions: { timestamps: "none", transcribeStyle: "clean" },
        },
      }),
    );
    const response = await send(
      `${endpoint}/speechtotext/transcriptions:transcribe?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    // The body can echo what was said, so only the status is reported.
    if (!response.ok) throw new Error(`Transcription failed with status ${response.status}.`);
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new Error("Transcription returned an unexpected answer.");
    return parsed.data.combinedPhrases
      .map((phrase) => phrase.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TRANSCRIPT);
  };
}

/** Distinct, short, non-empty hints, capped so a large account list stays one request. */
function phraseList(phrases: string[]): string[] {
  const kept = new Map<string, string>();
  for (const phrase of phrases) {
    const text = phrase.replace(/\s+/g, " ").trim().slice(0, 50);
    if (text && !kept.has(text.toLowerCase())) kept.set(text.toLowerCase(), text);
  }
  return [...kept.values()].slice(0, MAX_PHRASES);
}
