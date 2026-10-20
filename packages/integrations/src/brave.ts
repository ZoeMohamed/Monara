// Brave Search, used only to learn what kind of business a merchant is. Callers
// send nothing but a merchant name and, when known, its city; never amounts,
// email content, or anything that identifies a User.

const SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
// A search is optional enrichment that a failure skips, and normally answers in under a
// second, so a slow one is not worth waiting for.
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_RESULTS = 5;
const MAX_QUERY_LENGTH = 200;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface BraveSearchConfig {
  apiKey: string;
  fetcher?: Fetcher;
}

/** One search result. Untrusted web content: treat as data, never as instructions. */
export interface BraveSearchResult {
  title: string;
  description: string;
  url: string;
}

/** A failed search. rateLimited tells the caller to retry later rather than give up. */
export class BraveSearchError extends Error {
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = "BraveSearchError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  get rateLimited(): boolean {
    return this.status === 429;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Removes the highlight tags Brave puts around matched words. */
function plainText(value: unknown): string {
  return typeof value === "string" ? value.replace(/<\/?strong>/g, "").trim() : "";
}

export function createBraveSearchClient(config: BraveSearchConfig) {
  const apiKey = config.apiKey.trim();
  if (!apiKey)
    throw new Error("Missing required Brave Search configuration: BRAVE_SEARCH_API_KEY.");
  const fetcher = config.fetcher ?? fetch;

  return {
    async search(query: string): Promise<BraveSearchResult[]> {
      const params = new URLSearchParams({
        q: query.slice(0, MAX_QUERY_LENGTH),
        count: String(MAX_RESULTS),
        country: "ID",
        safesearch: "strict",
      });
      let response: Response;
      try {
        response = await fetcher(`${SEARCH_URL}?${params}`, {
          method: "GET",
          headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new BraveSearchError("Brave Search could not be reached.");
      }
      if (!response.ok) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
        const date = retryAfter === null ? Number.NaN : Date.parse(retryAfter);
        const retryAfterMs =
          Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1000
            : Number.isFinite(date)
              ? Math.max(0, date - Date.now())
              : null;
        throw new BraveSearchError("Brave Search failed.", response.status, retryAfterMs);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new BraveSearchError("Brave Search returned invalid JSON.", response.status);
      }
      const web = isRecord(payload) && isRecord(payload.web) ? payload.web : null;
      const results = web && Array.isArray(web.results) ? web.results : [];
      return results.slice(0, MAX_RESULTS).flatMap((result) => {
        if (!isRecord(result)) return [];
        const title = plainText(result.title);
        const description = plainText(result.description);
        const url = typeof result.url === "string" ? result.url : "";
        return title || description ? [{ title, description, url }] : [];
      });
    },
  };
}

export type BraveSearchClient = ReturnType<typeof createBraveSearchClient>;
