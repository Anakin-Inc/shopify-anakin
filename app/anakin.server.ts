/**
 * Anakin API client for the shopify-anakin embedded app.
 *
 * Ground truth for every endpoint, body shape, and error/poll semantic below
 * is /Users/arun/Anakin/anakin-py/src/anakin/client.py and models.py (the
 * official Python SDK) -- read directly, not guessed. This file re-implements
 * only the three operations this app's UI exposes (url-scraper, search,
 * agentic-search); it is a hand-rolled `fetch` client, not a port of the SDK,
 * because there is no official Anakin JS/TS SDK to depend on (this session's
 * survey of the anakin-* packages only found Python, matching what's in this
 * repo's siblings).
 *
 * Base URL: https://api.anakin.io/v1
 * Auth: `X-API-Key: <key>` header on every request.
 */

const BASE_URL = "https://api.anakin.io/v1";

// Same terminal-state and job-id-key handling as anakin-py's
// `_is_job_terminal` / `_require_job_id` helpers in client.py.
type JobStatus = "pending" | "processing" | "completed" | "failed";

export class AnakinApiError extends Error {
  status: number | null;
  body: unknown;

  constructor(message: string, status: number | null, body?: unknown) {
    super(message);
    this.name = "AnakinApiError";
    this.status = status;
    this.body = body;
  }
}

export class AnakinJobFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnakinJobFailedError";
  }
}

export class AnakinJobTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnakinJobTimeoutError";
  }
}

async function anakinFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch (cause) {
    // DNS / connection / timeout failure -- distinct from a real HTTP
    // error response, same distinction anakin-py's NetworkError draws.
    throw new AnakinApiError(
      `Could not reach the Anakin API (${(cause as Error).message}). Check your network connection and try again.`,
      null,
    );
  }

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON body (e.g. an upstream proxy error page) -- fall through
      // with body left as the raw text so callers still see *something*.
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as Record<string, unknown>).message)
        : null) ??
      (body && typeof body === "object" && "error" in body
        ? String((body as Record<string, unknown>).error)
        : null) ??
      `Anakin API returned ${response.status}`;
    throw new AnakinApiError(message, response.status, body);
  }

  return body;
}

function requireJobId(submitted: unknown): string {
  const obj = submitted as Record<string, unknown> | null;
  const jobId = obj?.jobId ?? obj?.job_id ?? obj?.id;
  if (typeof jobId !== "string" || !jobId) {
    throw new AnakinApiError(
      `Anakin API response did not include a job id: ${JSON.stringify(submitted)}`,
      null,
    );
  }
  return jobId;
}

function isTerminal(body: unknown): boolean {
  const status = (body as Record<string, unknown> | null)?.status as
    | JobStatus
    | undefined;
  return status === "completed" || status === "failed";
}

/**
 * Poll a job endpoint until it reaches a terminal state or `timeoutMs`
 * elapses. Mirrors anakin-py's `HttpClient.poll` (exponential-ish fixed
 * interval here, kept simple since this runs inside a single React Router
 * `action`/`loader` that the browser is waiting on -- see SUBMIT.md for why
 * that's a real constraint this MVP doesn't fully solve for long jobs).
 */
async function pollJob(
  apiKey: string,
  path: string,
  { intervalMs = 2000, timeoutMs = 90_000 } = {},
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = (await anakinFetch(apiKey, path, { method: "GET" })) as Record<
      string,
      unknown
    >;
    if (isTerminal(result)) {
      if (result.status === "failed") {
        throw new AnakinJobFailedError(
          typeof result.error === "string" ? result.error : "Anakin job failed",
        );
      }
      return result;
    }
    if (Date.now() > deadline) {
      throw new AnakinJobTimeoutError(
        `Timed out after ${timeoutMs}ms waiting for ${path} to finish. The job may still complete on Anakin's side -- try again in a moment.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ─── url-scraper (submit + poll) ────────────────────────────────────────────

export interface ScrapeResult {
  id: string;
  url: string;
  status: string;
  markdown?: string | null;
  durationMs?: number;
  cached?: boolean;
}

export async function scrapeUrl(
  apiKey: string,
  url: string,
): Promise<ScrapeResult> {
  const submitted = await anakinFetch(apiKey, "/url-scraper", {
    method: "POST",
    body: JSON.stringify({
      url,
      country: "us",
      formats: ["markdown"],
      useBrowser: false,
      generateJson: false,
      forceFresh: false,
    }),
  });
  const jobId = requireJobId(submitted);
  const result = await pollJob(apiKey, `/url-scraper/${jobId}`);
  return result as unknown as ScrapeResult;
}

// ─── search (synchronous) ───────────────────────────────────────────────────

export interface SearchResultItem {
  url: string;
  title?: string | null;
  snippet?: string | null;
}

export interface SearchResult {
  id: string;
  results: SearchResultItem[];
}

export async function search(
  apiKey: string,
  prompt: string,
  limit = 5,
): Promise<SearchResult> {
  const result = await anakinFetch(apiKey, "/search", {
    method: "POST",
    body: JSON.stringify({ prompt, limit }),
  });
  return result as unknown as SearchResult;
}

// ─── agentic-search (submit + poll) ─────────────────────────────────────────

export interface AgenticSearchResult {
  id: string;
  status: string;
  generatedJson?: {
    summary?: string | null;
    structuredData?: Record<string, unknown> | null;
  } | null;
  durationMs?: number;
}

export async function agenticSearch(
  apiKey: string,
  prompt: string,
  schema?: Record<string, unknown>,
): Promise<AgenticSearchResult> {
  const submitted = await anakinFetch(apiKey, "/agentic-search", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      useBrowser: true,
      ...(schema ? { schema } : {}),
    }),
  });
  const jobId = requireJobId(submitted);
  // Agentic search is described by anakin-py as "multi-stage" and gets a
  // longer poll budget than url-scraper for that reason -- same open
  // question this session's tray-anakin/coda-anakin submissions flagged:
  // unverified against a real long-running job, just given more headroom.
  const result = await pollJob(apiKey, `/agentic-search/${jobId}`, {
    timeoutMs: 110_000,
  });
  return result as unknown as AgenticSearchResult;
}
