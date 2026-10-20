import { calendarDateSchema, type FxSnapshot, fxSnapshotSchema } from "@monara/contracts";
import { z } from "zod";

export const FX_LOOKUP_TIMEOUT_MS = 2_000;

export interface FxRateCache {
  load(day: string, signal: AbortSignal): Promise<FxSnapshot | null>;
  save(snapshot: FxSnapshot, signal: AbortSignal): Promise<FxSnapshot | null>;
}

const providerResponse = z.object({
  date: calendarDateSchema,
  base: z.literal("USD"),
  quote: z.literal("IDR"),
  rate: z.number().finite().positive(),
});

/** One deadline covers cache access, the HTTP response body, validation and persistence. */
export function createFxService(
  cache: FxRateCache,
  options: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {},
) {
  const inflight = new Map<string, Promise<FxSnapshot | null>>();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = Math.min(
    FX_LOOKUP_TIMEOUT_MS,
    Math.max(1, options.timeoutMs ?? FX_LOOKUP_TIMEOUT_MS),
  );

  async function lookup(day: string): Promise<FxSnapshot | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const work = (async () => {
      const cached = await cache.load(day, controller.signal);
      if (controller.signal.aborted) return null;
      if (cached) return fxSnapshotSchema.parse(cached);
      const url = new URL("https://api.frankfurter.dev/v2/rate/USD/IDR");
      url.searchParams.set("date", day);
      url.searchParams.set("providers", "ecb");
      const response = await fetcher(url, {
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok || !response.body) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return null;
        if (done) break;
        size += value.length;
        if (size > 4_096) {
          void reader.cancel();
          return null;
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const data = providerResponse.parse(JSON.parse(new TextDecoder().decode(bytes)));
      const snapshot = fxSnapshotSchema.parse({
        rate: String(data.rate),
        rateDate: data.date,
        requestedOn: day,
        source: "frankfurter_ecb",
        rounding: "half_up_rupiah",
      });
      if (controller.signal.aborted) return null;
      return cache.save(snapshot, controller.signal);
    })().catch(() => null);
    try {
      return await Promise.race([expired, work]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  }

  return {
    rateFor(day: string): Promise<FxSnapshot | null> {
      calendarDateSchema.parse(day);
      const existing = inflight.get(day);
      if (existing) return existing;
      const pending = lookup(day).finally(() => inflight.delete(day));
      inflight.set(day, pending);
      return pending;
    },
  };
}

export type FxService = ReturnType<typeof createFxService>;
