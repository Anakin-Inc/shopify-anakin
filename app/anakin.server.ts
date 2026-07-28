/**
 * Anakin API client for the shopify-anakin embedded app.
 *
 * Ground truth for the original three operations (url-scraper, search,
 * agentic-search) is /Users/arun/Anakin/anakin-py/src/anakin/client.py and
 * models.py (the official Python SDK) -- read directly, not guessed.
 *
 * Ground truth for every operation added afterwards (map, crawl, wire
 * discover/catalog/read-action, AI visibility, monitors, sessions) is
 * Anakin's own MCP server source -- /Users/arun/Anakin/anakin-mcp/src/client.ts
 * (the canonical `AnakinClient` used by anakin-mcp itself) and
 * /Users/arun/Anakin/anakin-mcp/src/tools/*.ts (the tool wrappers, which
 * document response-field meaning client.ts's own types leave as
 * `Record<string, unknown>`/`unknown`) -- also read directly, not guessed.
 * Where the MCP source itself types a response field loosely, this file
 * keeps that same looseness rather than inventing a shape (e.g. monitor and
 * Wire-catalog responses are rendered as raw JSON in the UI instead of
 * assuming field names no ground-truth source confirms).
 *
 * This is a hand-rolled `fetch` client, not a port of any SDK, because
 * there is no official Anakin JS/TS SDK to depend on (this session's survey
 * of the anakin-* packages only found Python and the MCP server's internal
 * client, matching what's in this repo's siblings).
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
    const message = extractErrorMessage(body) ?? `Anakin API returned ${response.status}`;
    throw new AnakinApiError(message, response.status, body);
  }

  return body;
}

/**
 * Normalize an error response body into a human-readable message. Handles
 * two shapes confirmed live against api.anakin.io while verifying this
 * file: Wire's nested envelope (`{ status: "error", error: { code,
 * message } }`, e.g. a 401 from `/wire/task`) and the legacy flat shape
 * (`{ error: "msg", code: "CODE" }`, e.g. a 401 from `/search`).
 * `anakin-mcp/src/client.ts`'s `toError` draws the exact same distinction
 * against the same live API -- this originally didn't handle the nested
 * shape and rendered it as the literal string "[object Object]", caught by
 * the live verification run documented in SUBMIT.md.
 */
function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (obj.error && typeof obj.error === "object") {
    const nested = obj.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
    if (typeof nested.code === "string") return nested.code;
  }
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.error === "string") return obj.error;
  return null;
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

// ─── map (submit + poll) ─────────────────────────────────────────────────
//
// Ground truth: anakin-mcp/src/client.ts `AnakinClient.map` and
// `MapOptions`, and src/tools/map.ts's defaults (limit=100, depth=2,
// limitPerLevel=100). Same POST-then-poll job envelope as url-scraper.

export interface MapOptions {
  limit?: number;
  depth?: number;
  includeSubdomains?: boolean;
  includeExternalLinks?: boolean;
  useBrowser?: boolean;
  search?: string;
}

export interface MapResult {
  id: string;
  url: string;
  status: string;
  links?: string[];
  totalLinks?: number;
  externalLinks?: string[];
  totalExternalLinks?: number;
  durationMs?: number;
  error?: string | null;
}

export async function mapSite(
  apiKey: string,
  url: string,
  options: MapOptions = {},
): Promise<MapResult> {
  const body: Record<string, unknown> = {
    url,
    limit: options.limit ?? 100,
    depth: options.depth ?? 2,
    limitPerLevel: 100,
    includeSubdomains: options.includeSubdomains ?? false,
    includeExternalLinks: options.includeExternalLinks ?? false,
    useBrowser: options.useBrowser ?? false,
  };
  if (options.search) body.search = options.search;

  const submitted = await anakinFetch(apiKey, "/map", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const jobId = requireJobId(submitted);
  // Map is a link-discovery job, not a full-page fetch -- same 90s budget
  // as url-scraper is a reasonable starting point (see SUBMIT.md's existing
  // "single request/response cycle vs. a long-running job" caveat, which
  // applies here too).
  const result = await pollJob(apiKey, `/map/${jobId}`, { timeoutMs: 90_000 });
  return result as unknown as MapResult;
}

// ─── crawl (submit + poll) ──────────────────────────────────────────────
//
// Ground truth: anakin-mcp/src/client.ts `AnakinClient.crawl` and
// `CrawlOptions`, src/tools/crawl.ts's defaults (maxPages=10, depth=1,
// country="us"). `sessionId` lets a crawl reuse a saved browser session
// (see sessionsList below / app/routes/app.sessions.tsx) for login-protected
// sites -- the same field scrapeUrl's underlying API supports but this
// app's scrape form doesn't currently expose.

export interface CrawlOptions {
  maxPages?: number;
  depth?: number;
  country?: string;
  useBrowser?: boolean;
  sessionId?: string;
}

export interface CrawlPage {
  url: string;
  status: string;
  markdown?: string | null;
  durationMs?: number;
  error?: string | null;
}

export interface CrawlResult {
  id: string;
  url: string;
  status: string;
  totalPages?: number;
  completedPages?: number;
  pages?: CrawlPage[];
  durationMs?: number;
  error?: string | null;
}

export async function crawlSite(
  apiKey: string,
  url: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const body: Record<string, unknown> = {
    url,
    maxPages: options.maxPages ?? 10,
    depth: options.depth ?? 1,
    country: options.country ?? "us",
    useBrowser: options.useBrowser ?? false,
  };
  if (options.sessionId) body.sessionId = options.sessionId;

  const submitted = await anakinFetch(apiKey, "/crawl", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const jobId = requireJobId(submitted);
  // Crawl fetches up to maxPages pages sequentially -- a longer budget than
  // url-scraper's single-page 90s, same reasoning as agentic-search's 110s.
  const result = await pollJob(apiKey, `/crawl/${jobId}`, {
    timeoutMs: 110_000,
  });
  return result as unknown as CrawlResult;
}

// ─── Wire: discovery + catalog (synchronous GETs) ───────────────────────
//
// Ground truth: anakin-mcp/src/client.ts `wireResolve`/`wireCatalog` and
// src/tools/wire.ts's `wireDiscoverTool`/`wireCatalogTool` descriptions.
// Wire is Anakin's catalog of pre-built per-site automations (Amazon,
// Walmart, LinkedIn, etc.) -- a natural fit for "research a competitor's
// listing on a specific marketplace" without hand-rolling a scrape.

export interface WireResolveResult {
  results?: Array<Record<string, unknown>>;
  next?: string;
}

export async function wireDiscover(
  apiKey: string,
  q: string,
  limit = 5,
): Promise<WireResolveResult> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const result = await anakinFetch(apiKey, `/wire/resolve?${params.toString()}`, {
    method: "GET",
  });
  return result as unknown as WireResolveResult;
}

/**
 * With no `slug`, lists every catalog (site) Wire supports. With a `slug`,
 * returns that site's full action list with parameter schemas. The exact
 * response shape is intentionally left as `unknown` here, matching
 * client.ts's own `Promise<unknown>` return type -- Anakin's own MCP client
 * doesn't commit to a concrete field list for this endpoint either, so
 * this app renders it as raw JSON rather than guessing column names.
 */
export async function wireCatalog(apiKey: string, slug?: string): Promise<unknown> {
  const path = slug ? `/wire/catalog/${encodeURIComponent(slug)}` : "/wire/catalog";
  return await anakinFetch(apiKey, path, { method: "GET" });
}

// ─── Wire: run a read action (submit + poll) ────────────────────────────
//
// Ground truth: anakin-mcp/src/client.ts `wireRun`/`pollWireJob` and
// `WireJobStatus`/`WireJobError`. Deliberately only the READ half of Wire's
// read/write split is wired into this app (see wireReadAction below) --
// wire_write_action, wire_login, and wire_build are out of scope for a
// merchant-facing research app; see SUBMIT.md.

export interface WireJobError {
  code?: string;
  message?: string;
  details?: string;
  /** Present on AUTH_REQUIRED -- where to connect the account. */
  connect_url?: string;
  [key: string]: unknown;
}

export interface WireActionResult {
  status: string;
  /** Present when completed -- the action's extracted data. */
  data?: Record<string, unknown> | null;
  credits_used?: number;
  execution_ms?: number;
  error?: WireJobError | null;
  [key: string]: unknown;
}

async function pollWireJob(
  apiKey: string,
  jobId: string,
  timeoutMs = 90_000,
): Promise<WireActionResult> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = (await anakinFetch(apiKey, `/wire/jobs/${jobId}`, {
      method: "GET",
    })) as Record<string, unknown>;
    const status = result.status as string | undefined;
    if (status === "completed") {
      return result as unknown as WireActionResult;
    }
    if (status === "failed") {
      const err = result.error as WireJobError | undefined;
      throw new AnakinJobFailedError(
        err?.message ?? err?.code ?? "Wire action failed",
      );
    }
    if (Date.now() > deadline) {
      throw new AnakinJobTimeoutError(
        `Timed out after ${timeoutMs}ms waiting for Wire job ${jobId} to finish.`,
      );
    }
    // Respect the server's pacing hint when present, same as client.ts's
    // pollWireJob, clamped to a sane range.
    const wait =
      typeof result.retry_after_ms === "number"
        ? (result.retry_after_ms as number)
        : 2000;
    await new Promise((r) => setTimeout(r, Math.min(Math.max(wait, 500), 10_000)));
  }
}

export async function wireReadAction(
  apiKey: string,
  actionId: string,
  params?: Record<string, unknown>,
): Promise<WireActionResult> {
  const body: Record<string, unknown> = { action_id: actionId };
  if (params && Object.keys(params).length > 0) body.params = params;

  const accepted = (await anakinFetch(apiKey, "/wire/task", {
    method: "POST",
    body: JSON.stringify(body),
  })) as Record<string, unknown>;

  const jobId = accepted.job_id;
  if (typeof jobId !== "string" || !jobId) {
    // Sync action: terminal data already came back inline, same as
    // client.ts's wireRun short-circuit.
    return accepted as unknown as WireActionResult;
  }
  return await pollWireJob(apiKey, jobId);
}

// ─── AI Visibility ───────────────────────────────────────────────────────
//
// Ground truth: anakin-mcp/src/client.ts `aiVisibilitySources`/
// `aiVisibilitySearch` and `AIVisibilitySearch`, and
// src/tools/ai-visibility.ts's descriptions ("what do AI engines say about
// X" brand/AI-SEO visibility checks -- a natural fit for a merchant asking
// how ChatGPT/Gemini/AI Overviews describe their store or product).

export interface AIVisibilitySourceInfo {
  slug: string;
  label: string;
  [key: string]: unknown;
}

export async function aiVisibilitySources(
  apiKey: string,
): Promise<AIVisibilitySourceInfo[]> {
  const result = await anakinFetch(apiKey, "/ai-visibility/sources", {
    method: "GET",
  });
  return result as unknown as AIVisibilitySourceInfo[];
}

export interface AIVisibilityResultItem {
  source?: string;
  status?: string;
  summary?: string | null;
  full_content?: unknown;
  [key: string]: unknown;
}

export interface AIVisibilitySearchResult {
  search_id: string;
  status: string;
  synthesis?: string | null;
  country?: string;
  results: AIVisibilityResultItem[];
}

export async function aiVisibilitySearch(
  apiKey: string,
  query: string,
  options: { sources?: string[]; country?: string } = {},
): Promise<AIVisibilitySearchResult> {
  const body: Record<string, unknown> = { query };
  if (options.sources && options.sources.length > 0) body.sources = options.sources;
  if (options.country) body.country = options.country;

  const submitted = (await anakinFetch(apiKey, "/ai-visibility/search", {
    method: "POST",
    body: JSON.stringify(body),
  })) as Record<string, unknown>;

  const searchId = submitted.search_id;
  if (typeof searchId !== "string" || !searchId) {
    throw new AnakinApiError(
      `Anakin API response did not include a search_id: ${JSON.stringify(submitted)}`,
      null,
    );
  }

  // client.ts polls up to 3 minutes; kept just under that here since this
  // runs inside a single React Router action -- same tension documented in
  // SUBMIT.md for url-scraper/agentic-search.
  const deadline = Date.now() + 170_000;
  let current = submitted;
  while (current.status === "running") {
    if (Date.now() > deadline) {
      throw new AnakinJobTimeoutError(
        `Timed out after 170s waiting for AI visibility search ${searchId} to finish -- it may still complete on Anakin's side; check again in a moment.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    current = (await anakinFetch(apiKey, `/ai-visibility/search/${searchId}`, {
      method: "GET",
    })) as Record<string, unknown>;
  }
  // Unlike pollJob, a "failed" status is returned (not thrown): the payload
  // carries per-source results/errors the caller needs either way -- same
  // choice client.ts's aiVisibilitySearch makes.
  return current as unknown as AIVisibilitySearchResult;
}

// ─── Website Monitoring ──────────────────────────────────────────────────
//
// Ground truth: anakin-mcp/src/client.ts `monitorCreate`/`monitorList`/
// `monitorChanges`/`monitorControl` and src/tools/monitor.ts (including its
// `redactSecrets`/`SECRET_KEYS` handling of `alertWebhookSecret`, mirrored
// here for the same reason: a webhook-signing secret that reaches a
// browser-rendered page is compromised by definition). A natural fit for
// "watch a competitor's price/stock page and alert me when it changes."
//
// Response shapes below are left loose (`unknown`/`Record<string,
// unknown>`) matching client.ts's own typing -- it doesn't commit to a
// concrete Monitor interface either, so this app doesn't invent one.

const MONITOR_SECRET_KEYS = new Set(["alertWebhookSecret"]);
const MONITOR_SECRET_REDACTED = "[redacted -- view in the Anakin dashboard]";

/** Deep-copy `value` with any secret-bearing keys replaced, recursively. */
function redactMonitorSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactMonitorSecrets(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] =
        MONITOR_SECRET_KEYS.has(k) && v ? MONITOR_SECRET_REDACTED : redactMonitorSecrets(v);
    }
    return out as unknown as T;
  }
  return value;
}

export interface MonitorCreateOptions {
  scope?: "page" | "site" | "wire";
  watchMode?: "full_page" | "specific_data";
  watchFormat?: "markdown" | "html" | "cleaned_html";
  aiMode?: boolean;
  aiGoal?: string;
  useBrowser?: boolean;
  country?: string;
  sessionId?: string;
  isActive?: boolean;
  alertWebhookUrl?: string;
  alertEmails?: string;
}

export async function monitorCreate(
  apiKey: string,
  url: string,
  intervalMinutes: number,
  options: MonitorCreateOptions = {},
): Promise<unknown> {
  const body: Record<string, unknown> = { url, intervalMinutes };
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined && v !== "") body[k] = v;
  }
  const result = await anakinFetch(apiKey, "/monitors", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return redactMonitorSecrets(result);
}

export async function monitorList(apiKey: string): Promise<unknown> {
  const result = await anakinFetch(apiKey, "/monitors", { method: "GET" });
  return redactMonitorSecrets(result);
}

export async function monitorChanges(apiKey: string, id: string): Promise<unknown> {
  const result = await anakinFetch(
    apiKey,
    `/monitors/${encodeURIComponent(id)}/changes`,
    { method: "GET" },
  );
  return redactMonitorSecrets(result);
}

export type MonitorControlAction = "pause" | "resume" | "run_now" | "delete";

export async function monitorControl(
  apiKey: string,
  id: string,
  action: MonitorControlAction,
): Promise<unknown> {
  const base = `/monitors/${encodeURIComponent(id)}`;
  let result: unknown;
  switch (action) {
    case "pause":
      result = await anakinFetch(apiKey, `${base}/pause`, { method: "POST" });
      break;
    case "resume":
      result = await anakinFetch(apiKey, `${base}/resume`, { method: "POST" });
      break;
    case "run_now":
      result = await anakinFetch(apiKey, `${base}/run`, { method: "POST" });
      break;
    case "delete":
      result = await anakinFetch(apiKey, base, { method: "DELETE" });
      break;
  }
  return redactMonitorSecrets(result);
}

// ─── Browser sessions (read-only here) ──────────────────────────────────
//
// Ground truth: anakin-mcp/src/client.ts `sessionsList` and
// src/tools/sessions.ts, which deliberately does NOT expose session
// *creation* -- that's an interactive noVNC login flow (2FA/captchas
// included) that can't run inside an API call, only Anakin's own
// dashboard. This app mirrors that: session_list only, so a merchant can
// see which saved sessions exist and copy a sessionId into the Crawl form
// above for login-protected competitor pages. session_delete is skipped
// (see SUBMIT.md) since it's a destructive op with little payoff in a
// read-mostly research app.

export async function sessionsList(apiKey: string, domain?: string): Promise<unknown> {
  const path = domain ? `/sessions?domain=${encodeURIComponent(domain)}` : "/sessions";
  return await anakinFetch(apiKey, path, { method: "GET" });
}
