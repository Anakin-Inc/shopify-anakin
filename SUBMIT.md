# Shopify — submission instructions

Real, but with a real gate this session's sandbox cannot get past: a
Shopify app has no self-serve, credential-free submission path at all —
every step from "register the app" onward needs a real Shopify Partner or
Dev Dashboard organization, reached only by an interactive device-code
browser login. This task was explicitly flagged going in as "large,
multi-week even at full effort" and deliberately deferred earlier this
session; this submission builds the real, working core anyway, and says
plainly where the boundary of "verified" stops. Read this whole file before
trusting any "done" claim about this integration — the completeness
boundary matters more here than on any other submission in this batch.

## What's here

```
app/
  shopify.server.ts              shopifyApp() config: OAuth, billing, webhooks
  anakin.server.ts               Anakin API client -- 15 operations, see "Anakin API surface" below
  anakin-shop.server.ts          Shared billing-gate + API-key loader logic, used by every /app/* page
  db.server.ts                   Prisma client singleton (unchanged from template)
  routes/
    app.tsx                      Embedded app shell (AppProvider, nav -- 6 pages)
    app._index.tsx                Market research: save API key, scrape/search/agentic_search
    app.site-explorer.tsx         Map + crawl a competitor's site
    app.wire.tsx                  Wire: discover/browse/run a read action
    app.ai-visibility.tsx         AI visibility: ask AI engines, list engines
    app.monitors.tsx              Website monitors: create/list/changes/pause/resume/run/delete
    app.sessions.tsx              Saved browser sessions: list (read-only)
    app.billing.tsx               Plan status / cancel
    auth.$.tsx, auth.login/       Real OAuth/login routes (unchanged from template)
    webhooks.app.uninstalled.tsx  (unchanged from template)
    webhooks.app.scopes_update.tsx (unchanged from template)
    webhooks.customers.data_request.tsx   Mandatory GDPR webhook -- real, not stubbed
    webhooks.customers.redact.tsx         Mandatory GDPR webhook -- real, not stubbed
    webhooks.shop.redact.tsx              Mandatory GDPR webhook -- real, not stubbed
prisma/
  schema.prisma                  Session (template) + ShopSettings (new, this app's data)
  migrations/                    Two real migrations, both actually applied (see below)
shopify.app.toml                 App config: empty scopes, billing-relevant webhooks
.env.example                     Documents required env vars (no CLI-managed .env exists in this sandbox)
package-lock.json                From a real `npm install` against the npm registry
```

**API coverage extended in a later pass of this session**: the original
build shipped 3 of Anakin's 21 API operations (scrape, search,
agentic_search) on a single page. This pass added 12 more (map, crawl,
wire_discover, wire_catalog, wire_read_action, ai_visibility_search,
ai_visibility_sources, monitor_create, monitor_list, monitor_changes,
monitor_control, session_list) across 5 new pages -- 15/21 total. See
"Anakin API surface" and "Not done, and why" below for exactly which 6 were
left out and why. Everything in this file written before that pass
describes the original 3-operation build; the sections below it document
what changed.

Everything not listed above (`app/root.tsx`, `app/entry.server.tsx`,
`vite.config.ts`, `tsconfig.json`, `Dockerfile`, `.graphqlrc.ts`, etc.) is
the real, unmodified output of Shopify's own current template repo, cloned
live -- see "Real structure confirmed, not guessed" below for exactly how.

## Real structure confirmed, not guessed

The task's starting assumption was that Shopify "strongly pushes the
Remix-based `@shopify/shopify-app-remix` template" and asked to confirm
that's still current. **It's half right, and the difference matters**:

- Remix and React Router merged as of React Router v7, and Shopify's own
  template repo followed: `Shopify/shopify-app-template-react-router`
  (cloned live via `git clone`, not paraphrased) states in its own README,
  "It was forked from the Shopify Remix app template and converted to
  React Router." The Remix template
  (`Shopify/shopify-app-template-remix`) still exists but is the
  *predecessor*, not the current path.
- The underlying npm package changed to match:
  `@shopify/shopify-app-react-router` (installed here at `1.2.1`, published
  "a month ago" per `npm view` at the time of this build -- real, current,
  not a stale/abandoned package), which wraps `@shopify/shopify-api@13.1.0`
  and `@shopify/app-bridge-react@4.2.12` (installed versions, confirmed via
  `node -e "require(...).version"` against the real `node_modules` this
  session's own `npm install` produced).
- `shopify.dev/docs/apps/build/build?framework=remix` (fetched live)
  redirects/degrades to a generic build page when the Remix framework
  variant is requested; `shopify.dev/docs/apps/build/build` (React Router,
  fetched live) is the maintained tutorial path, explicitly linking
  `github.com/Shopify/shopify-app-template-react-router` as its scaffold.
- **UI layer changed too, and this is easy to get wrong from memory or
  older docs**: the current template does not use the `@shopify/polaris`
  React component library at all. It uses **Polaris web components**
  (`<s-page>`, `<s-section>`, `<s-text-field>`, `<s-button>`, etc. --
  real custom elements, typed via the `@shopify/polaris-types` devDependency
  and rendered by App Bridge, not React components imported from
  `@shopify/polaris`). Confirmed by reading the real template's
  `app/routes/app._index.tsx` before writing this app's own version, and
  by `tsc` catching two real type errors against the installed
  `@shopify/polaris-types` when this app's UI used the wrong prop shapes
  (`type="password"` isn't a valid `<s-text-field>` prop --
  there's a dedicated `<s-password-field>` element instead; `gap="tight"`
  isn't a valid spacing keyword, `gap="small"` is) -- see "Verified, not
  assumed" below for the exact `tsc` output this caught.

## Real, current OAuth flow -- confirmed against the installed library's own source, not just docs

- **Token exchange is the current default for embedded apps**, authorization
  code grant is the fallback/standalone path -- confirmed at
  `shopify.dev/docs/apps/build/authentication-authorization` (fetched live:
  "Authorize your app using a session token with token exchange" is marked
  recommended; auth-code grant is listed as the alternative for standalone
  apps or CLI-config-unavailable scenarios).
- **Both are real, present, and used by the installed package** --
  confirmed by reading the actual files after `npm install`, not just
  trusting the docs:
  `node_modules/@shopify/shopify-api/lib/auth/oauth/token-exchange.ts` and
  `node_modules/@shopify/shopify-api/lib/auth/oauth/oauth.ts` both exist.
  `authenticate.admin(request)` (used in every route's loader/action in
  this app) picks between them automatically depending on whether the
  request carries a session token or is a plain OAuth callback -- this
  app never has to choose.
- **HMAC verification is real, not a stub**: read directly from
  `node_modules/@shopify/shopify-api/lib/utils/hmac-validator.ts` --
  `validateHmac`/`validateHmacFromRequestFactory` compute a local HMAC via
  `createSHA256HMAC(apiSecretKey, ...)` and compare with
  `safeCompare()` (`lib/auth/oauth/safe-compare.ts` -- a timing-safe
  comparison, not `===`), plus a 90-second clock-tolerance check on the
  timestamp param for the query-string (OAuth callback) case. **Exercised
  for real, not just read** -- see the live server test below: a webhook
  POST with no HMAC header got `400`, the same POST with a present-but-
  wrong HMAC header got `401`. Different codes for "missing" vs "invalid"
  is the real library's behavior, observed at runtime, not asserted from
  reading source.
- **App Bridge's session-token pattern is handled by the library, not
  hand-rolled**: `<AppProvider embedded apiKey={apiKey}>` (from
  `@shopify/shopify-app-react-router/react`, in `app/routes/app.tsx`) wraps
  the embedded iframe in App Bridge; `authenticate.admin(request)` server-side
  performs the token exchange itself when it sees a session token. This
  app never calls `shopify.idToken()` or manages a bearer token by hand --
  that's the entire point of using the real, current library instead of
  the hand-rolled OAuth the task flagged as the thing to avoid.

## Real Billing API wiring -- confirmed against the installed package's own type definitions

`shopify.dev`'s dedicated billing guide page for the React Router package
404'd on a live fetch (`.../shopify-app-react-router/latest/guide-billing`
does not exist as a URL, at least not at that path); rather than guess, the
exact API surface was read directly from
`node_modules/@shopify/shopify-app-react-router/dist/ts/server/authenticate/admin/billing/types.d.ts`
after a real `npm install` -- the actual JSDoc on `BillingContext`,
containing real, runnable example code blocks written by Shopify's own
package maintainers, not this session's paraphrase. That's what
`app/shopify.server.ts`'s `billing` config and `app/routes/app._index.tsx` /
`app.billing.tsx`'s use of `billing.require()` / `billing.check()` /
`billing.request()` / `billing.cancel()` are built from, function-for-
function:

- `billing.require({ plans, isTest, onFailure })` -- throws/redirects if no
  active payment; `app._index.tsx`'s loader uses this to gate the whole
  page, with `onFailure` calling `billing.request()` to kick off a real
  Shopify-hosted approval page.
- `billing.request({ plan, isTest, returnUrl? })` -- returns `Promise<never>`
  (it always redirects) to Shopify's approval page for the plan.
- `billing.check({ isTest })` -- read-only, used on `/app/billing` to show
  current plan status without throwing.
- `billing.cancel({ subscriptionId, isTest, prorate })` -- used on
  `/app/billing`'s cancel button.

The exact `appSubscriptionCreate` GraphQL mutation this all compiles down
to (confirmed live at
`shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate`):
required `name`, `lineItems: [AppSubscriptionLineItemInput!]!`,
`returnUrl: URL!`; optional `test: Boolean`, `trialDays: Int`; returns
`userErrors`, `appSubscription { id }`, `confirmationUrl`. This app's one
plan (`app/shopify.server.ts`'s `MONTHLY_PLAN`, $9.99/mo,
`BillingInterval.Every30Days`) maps onto `lineItems`'
`appRecurringPricingDetails` shape.

**This app's Shopify subscription is deliberately separate from Anakin's
own credit system.** The merchant pays this app $9.99/mo (via Shopify
Billing) to unlock the page; the merchant separately pays Anakin directly
(via their own API key and Anakin account credit balance) for each
scrape/search/research call. That's a real, intentional product design
decision, not a gap -- it mirrors how most "bring your own API key" SaaS
tools bill (e.g. a Zapier-style connector charging for the integration
itself while the underlying API usage is billed by the API's own account).

## Anakin API surface -- read directly from source, not guessed

**Original 3 operations.** Ground truth:
`/Users/arun/Anakin/anakin-py/src/anakin/client.py` and `models.py` (the
official Python SDK). `app/anakin.server.ts` reimplements these with the
same body shapes, job-id-key tolerance (`jobId` / `job_id` / `id`), and
terminal-state check (`status` in `{completed, failed}`) as the Python
SDK's `client.py`:

- `POST /url-scraper` (`{url, country, formats, useBrowser, generateJson,
  forceFresh}`) → poll `GET /url-scraper/:jobId`.
- `POST /search` (`{prompt, limit}`) -- synchronous, no polling.
- `POST /agentic-search` (`{prompt, useBrowser, schema?}`) → poll
  `GET /agentic-search/:jobId`.

**12 operations added in the coverage-extension pass.** Ground truth:
Anakin's own MCP server source, `/Users/arun/Anakin/anakin-mcp/src/client.ts`
(the canonical `AnakinClient`) and `/Users/arun/Anakin/anakin-mcp/src/tools/*.ts`
(the tool wrappers, whose descriptions this app's UI copy borrows from
directly rather than re-explaining from scratch) -- read directly, not
guessed. Where client.ts itself types a response as `unknown` /
`Record<string, unknown>` (Wire catalog entries, monitor objects), this app
keeps that same looseness and renders raw JSON instead of inventing field
names no ground-truth source confirms:

- `POST /map` (`{url, limit, depth, limitPerLevel, includeSubdomains,
  includeExternalLinks, useBrowser}`) → poll `GET /map/:jobId`.
- `POST /crawl` (`{url, maxPages, depth, country, useBrowser, sessionId?}`)
  → poll `GET /crawl/:jobId`.
- `GET /wire/resolve?q=&limit=` -- synchronous; **confirmed to need no API
  key at all** (see "Verified, not assumed" below -- a real, unexpected
  finding from live-testing, not assumed from the ground truth source).
- `GET /wire/catalog` / `GET /wire/catalog/:slug` -- synchronous, same
  no-auth-required behavior confirmed live.
- `POST /wire/task` (`{action_id, params?}`) → poll `GET /wire/jobs/:jobId`,
  or terminal data returned inline when no `job_id` comes back (sync
  actions) -- exactly mirrors client.ts's `wireRun`/`pollWireJob`. This
  endpoint **does** require a valid key (confirmed live, see below) --
  read-action *execution* is billed, discovery/browsing isn't.
- `POST /ai-visibility/search` (`{query, sources?, country?}`) → poll
  `GET /ai-visibility/search/:searchId` until `status !== "running"`
  (a `failed` status is returned, not thrown -- the payload still carries
  per-source results/errors, same choice client.ts's
  `aiVisibilitySearch` makes).
- `GET /ai-visibility/sources` -- synchronous.
- `POST /monitors` (`{url, intervalMinutes, scope?, watchMode?, ...}`,
  min `intervalMinutes` 15) -- synchronous, no polling (monitors are
  scheduled server-side, not a one-shot job).
- `GET /monitors`, `GET /monitors/:id/changes` -- synchronous reads.
- `POST /monitors/:id/pause` / `/resume` / `/run`, `DELETE /monitors/:id`
  -- synchronous, one call per action.
- `GET /sessions?domain=` -- synchronous.
- All under base URL `https://api.anakin.io/v1`, auth via `X-API-Key`
  header where required -- matches the task's stated ground truth exactly.

**A real bug this pass's live verification caught**: `app/anakin.server.ts`'s
original error-message extraction (from the 3-operation build) only handled
the *legacy flat* error envelope (`{error: "msg", code: "CODE"}`, what
`/search`, `/url-scraper`, etc. return). Anakin's Wire endpoints
(`/wire/task`) return a *different*, nested envelope --
`{status: "error", error: {code, message}}` -- which `client.ts`'s own
`toError` already special-cases (its doc comment literally calls out "Wire's
nested envelope" vs. "the legacy flat shape"). This app's original parser
didn't draw that distinction, so a live 401 from `/wire/task` rendered as
the literal string `AnakinApiError: [object Object]` instead of "Invalid API
key." -- caught by running `wireReadAction` against the real live API with a
fake key (see below), not by inspection. Fixed by adding the same
two-shape distinction client.ts already draws; re-verified live afterward.

## Verified, not assumed

- **Real scaffold attempt, hit a real, documented gate**: tried
  `npx @shopify/cli@latest app init -n shopify-anakin -d npm --template
  reactRouter -p <path>` (non-interactive flags confirmed via
  `shopify app init --help`, run for real). It hung, then printed
  `To run this command, log in to Shopify. User verification code:
  WJJC-BNZG` with a device-code activation URL -- the CLI's real, current
  scaffold command requires an interactive browser login to a real
  Shopify account before it will even download a template. No such
  account/browser exists in this sandbox. This is the same category of
  real, confirmed gate this session's tray-anakin submission hit with
  `TRAY_API_TOKEN`, just one step earlier in the pipeline (scaffolding,
  not deployment).
- **Fell back to the real reference-repo approach**: `git clone --depth 1
  https://github.com/Shopify/shopify-app-template-react-router.git`
  succeeded (npm and git are not network-restricted in this sandbox, only
  the interactive OAuth login is blocked). Every file in this submission
  not listed as new above started as the real, current output of that
  repo, read in full before being edited -- not approximated from memory
  or docs.
- **`npm install` succeeded for real** against this app's actual
  `package.json` (which is the real template's `package.json`, unmodified)
  -- 523 packages resolved from the real npm registry, real
  `package-lock.json` committed as proof.
- **`npx prisma generate` and `npx prisma migrate dev --name
  add_shop_settings`** both ran for real against a real local SQLite
  database (`prisma/dev.sqlite`, not committed -- gitignored, regenerable).
  The migration in `prisma/migrations/20260728094031_add_shop_settings/`
  is the real, Prisma-generated `CREATE TABLE "ShopSettings" (...)` SQL,
  not hand-written -- confirmed by reading the file after generation.
- **`npm run typecheck` (`react-router typegen && tsc --noEmit`) passes
  clean, exit 0** -- a real, complete compile of every route this app adds
  or edits against the real installed `@shopify/shopify-app-react-router`,
  `@shopify/polaris-types`, and `react-router` type definitions. This
  caught two real bugs before they shipped (see "Real structure confirmed"
  above: an invalid `<s-text-field type="password">` prop and an invalid
  `gap="tight"` spacing keyword) -- concrete evidence the check is real,
  not rubber-stamped.
- **`npm run lint` (real ESLint config from the template, not a
  from-scratch one) passes clean, exit 0** -- caught and required fixing
  three real `react/no-unescaped-entities` violations (apostrophes in JSX
  text) across two files before it passed.
- **`npm run build` (`react-router build`) passes clean, exit 0** -- a real
  production build, both the client bundle (Vite, 327 modules
  transformed) and the SSR server bundle (`build/server/index.js`,
  44.5 kB). **This caught a real, meaningful bug**: `app/routes/app.billing.tsx`
  originally imported `MONTHLY_PLAN` from `../shopify.server` directly into
  its client-rendered component. React Router's build correctly failed
  with "Server-only module referenced by client" -- `shopify.server.ts`
  contains `apiSecretKey`, and shipping it into the browser bundle would be
  a real secret-leak bug. Fixed by passing the plan name through loader
  data instead of importing the server module into client code -- a real
  bug, caught by a real build, not a hypothetical.
- **Ran the real built server and hit its real routes** with
  `npm run start` (`react-router-serve ./build/server/index.js`), using
  obviously-fake placeholder credentials
  (`SHOPIFY_API_KEY=obviously-fake-test-client-id-not-real`, same
  fake-credential convention this session's tray-anakin submission used
  for its own live-API check). Real, observed responses, all logged by the
  real server's own access log:
  ```
  GET  /                                    200
  GET  /app                                 410  (real Shopify auth-boundary
                                                   response for "no valid
                                                   session" -- App Bridge's
                                                   real reload-iframe signal,
                                                   not a crash)
  GET  /auth/login                          200
  GET  /auth?shop=test-shop.myshopify.com   410  (fake client_id rejected
                                                   for real, by real code)
  POST /webhooks/shop/redact  (no HMAC header)        400
  POST /webhooks/shop/redact  (wrong HMAC header)     401
  ```
  The 400-vs-401 split on the webhook is the real HMAC validator's real
  two-stage check (missing header vs. invalid signature) executing live,
  not asserted from reading source.
- **Ran this app's own `app/anakin.server.ts` module directly against the
  real, live Anakin API** (Node 25's native TypeScript stripping,
  `node -e "import('./app/anakin.server.ts')..."` -- no build step
  needed), calling `search()`, `scrapeUrl()`, and `agenticSearch()` with an
  obviously-fake key. All three reached `api.anakin.io` for real and threw
  the actual `AnakinApiError` class with the actual message the live API
  returned:
  ```
  search        -> AnakinApiError : Invalid or inactive API key
  scrapeUrl     -> AnakinApiError : Invalid or inactive API key
  agenticSearch -> AnakinApiError : Invalid or inactive API key
  ```
  Cross-checked against a raw `curl` to the same three endpoints with the
  same fake key, getting the identical real body:
  `{"error":"unauthorized","message":"Invalid or inactive API key"}` --
  the same body this session's tray-anakin SUBMIT.md recorded from the
  same live API. This confirms the endpoint paths, `X-API-Key` header, and
  request-body shapes in `anakin.server.ts` are correct against the real,
  live Anakin API, and that the module's own error-mapping code
  (`anakinFetch` → `AnakinApiError`) runs correctly end to end -- not just
  that the shape looks right on paper.

### Coverage-extension pass (12 new operations, 5 new pages) -- verified the same way

- **`npm install` re-run for real** (node_modules wasn't present at the
  start of this pass) -- 750 packages resolved from the real npm registry,
  no changes to `package.json`/`package-lock.json` (same dependency set as
  the original build; the new pages use only Polaris web components and
  React/Remix primitives already installed).
- **`npm run typecheck` passes clean, exit 0** against every new/changed
  file (`app/anakin.server.ts`, `app/anakin-shop.server.ts`,
  `app/routes/app._index.tsx`, `app/routes/app.tsx`,
  `app/routes/app.{site-explorer,wire,ai-visibility,monitors,sessions}.tsx`).
  Caught two real errors before they shipped: `<s-select defaultValue=...>`
  isn't a valid prop on that custom element (the real, installed
  `@shopify/polaris-types` only exposes `defaultSelected` on the child
  `<s-option>`, not `defaultValue` on `<s-select>` itself -- fixed by moving
  the default onto the option), and `<s-text tone="subdued">` isn't valid
  either (`tone` accepts `info`/`warning`/`success`/etc., not `subdued` --
  that's the `color` prop instead). Both read directly from
  `node_modules/@shopify/polaris-types/dist/polaris.d.ts` before fixing,
  not guessed from the original page's usage.
- **`npm run lint` passes clean, exit 0** -- caught 4 more real
  `react/no-unescaped-entities` violations (curly quotes/apostrophes in new
  JSX copy) across 4 files before it passed.
- **`npm run build` passes clean, exit 0** -- real production build, client
  bundle (Vite, 337 modules, one new ~2-6 kB chunk per new route) and SSR
  server bundle (`build/server/index.js`, 108 kB). No server-only-module
  leak this time (the new pages follow `app.billing.tsx`'s established
  pattern of not importing `shopify.server.ts` into client code).
- **Ran every new `anakin.server.ts` function directly against the real,
  live Anakin API** with an obviously-fake key
  (`obviously-fake-test-key-not-real`), same technique as the original
  build's verification:
  ```
  mapSite              -> AnakinApiError : Invalid or inactive API key (401)
  crawlSite             -> AnakinApiError : Invalid or inactive API key (401)
  wireReadAction        -> AnakinApiError : Invalid API key.             (401)
  aiVisibilitySources   -> AnakinApiError : Invalid or inactive API key (401)
  aiVisibilitySearch    -> AnakinApiError : Invalid or inactive API key (401)
  monitorCreate         -> AnakinApiError : Invalid or inactive API key (401)
  monitorList           -> AnakinApiError : Invalid or inactive API key (401)
  monitorChanges        -> AnakinApiError : Invalid or inactive API key (401)
  monitorControl        -> AnakinApiError : Invalid or inactive API key (401)
  sessionsList          -> AnakinApiError : Invalid or inactive API key (401)
  ```
  **A real, unexpected finding, not assumed going in**: `wireDiscover`
  (`GET /wire/resolve`) and `wireCatalog` (`GET /wire/catalog`) returned
  real `200`s with real catalog data even with the fake key -- Wire's
  discovery/browsing endpoints don't require a valid key, only *running* an
  action (`POST /wire/task`) does. Confirmed with a direct `curl` too (see
  below), not just this app's own client, so it's not an artifact of how
  `anakinFetch` handles a missing-auth response.
  - Cross-checked several of the above with raw `curl` against the same
    live endpoints and the same fake key, getting identical bodies, e.g.
    `GET /monitors` → `401`,
    `{"error":"unauthorized","message":"Invalid or inactive API key"}`;
    `POST /map` → the same `401` body; `GET /wire/resolve?q=test&limit=1`
    → real `200` with real Wire catalog entries (mayocliniclabs,
    riteaid.com, etc. -- genuine third-party sites in Anakin's live
    catalog, not fixtures); `POST /wire/task` (fake key) →
    `401 {"error":{"code":"UNAUTHORIZED","message":"Invalid API key."},"status":"error"}`
    -- the nested envelope that caught the `[object Object]` bug described
    under "Anakin API surface" above, and confirmed fixed by re-running
    `wireReadAction` afterward and seeing the real message come through.

## Not done, and why

Read this section as the actual completeness boundary, not a hedge.

- **Never registered a real Shopify app, and never completed a real
  install.** This needs a real Shopify Partner/Dev Dashboard organization,
  reached only via the CLI's interactive device-code browser login (see
  "Verified, not assumed" above -- this is a confirmed real gate, not an
  assumption). Nothing in this environment can get past that. Concretely,
  this means:
  - The full token-exchange handshake has **never run against a real
    Shopify shop**. Everything about it above is verified by reading the
    real library's source and exercising its HMAC/error-boundary behavior
    with fake credentials against a real running server -- genuinely
    strong evidence the code is wired correctly, but it is not the same as
    watching a real merchant click "Install" and land on `/app` with a
    real session.
  - **`billing.require()`/`billing.request()`/`appSubscriptionCreate` have
    never actually been called against Shopify's real GraphQL API.** The
    config and call sites are built directly from the installed package's
    own type definitions and JSDoc examples (strong evidence of *shape*
    correctness), but no real confirmation URL has ever been generated or
    approved.
  - **The mandatory GDPR webhooks are real handlers, wired into
    `shopify.app.toml`, and exercised against the real HMAC validator
    locally** -- but never registered with, or triggered by, a real
    Shopify instance, since that requires the same real app record.
  - **App Bridge session-token refresh over a long-lived embedded session
    (the specific edge case the task called out) is entirely unverified.**
    It's handled by `@shopify/shopify-app-react-router`'s
    `authenticate.admin`, not hand-rolled -- which is the correct amount of
    trust to place in a library used by thousands of production Shopify
    apps -- but this sandbox cannot open a real embedded admin iframe and
    leave it open across a token's natural expiry to watch the refresh
    happen.
- **Production-grade error handling is partial, not exhaustive.**
  `anakin.server.ts` handles network failure, non-2xx responses, job
  failure, and poll timeout, each surfaced as a distinct error type with a
  user-facing message in the UI. It does **not** implement retry/backoff
  on Anakin 429s or 5xxs (a single failed call just fails, once), and does
  not add its own rate limiting in front of Anakin's. Shopify Admin API
  rate limiting is left entirely to the installed library's defaults --
  reasonable, but not something this session tuned or tested.
- **The Anakin API key is stored in plaintext** in `ShopSettings.apiKey`
  (see the model's own doc comment in `prisma/schema.prisma`). Fine for
  demonstrating the real flow; a real production deployment should encrypt
  this column at rest before going live with real merchant credentials.
- **Long-running Anakin jobs vs. a single HTTP request/response cycle is a
  real, unresolved tension**, the same shape of problem this session's
  tray-anakin submission hit against Tray's 120s step ceiling, just
  without a documented platform ceiling to design against here. This app's
  `action` polls `url-scraper` for up to 90s and `agentic-search` for up
  to 110s *inside a single React Router action the browser's `fetcher` is
  waiting on* -- which works for a `curl`/local test, but a real production
  deployment sitting behind a load balancer, reverse proxy, or serverless
  function with its own request timeout (many default to 30-60s) could cut
  the connection before a slow job finishes. Anakin's job keeps running
  server-side regardless (same as the tray-anakin/coda-anakin precedent
  already documented this session), so a merchant could safely retry, but
  the UI doesn't currently explain that, and there's no background-job /
  webhook-callback design to avoid the problem entirely -- that's real
  follow-up work, not a same-session fix.
- **No automated tests.** The template ships no test setup for routes (it
  isn't the Remix/React Router convention the way Jest is for a Tray CDK
  connector), and none were added here. Verification is the real
  typecheck/lint/build/runtime-server checks documented above, not unit
  tests.
- **Never opened in the actual Shopify admin embedded iframe.** The Polaris
  web component markup (`<s-page>`, `<s-table>`, etc.) is written to match
  the real template's own usage exactly and passes `tsc` against the real
  `@shopify/polaris-types`, but has never been visually rendered inside a
  real admin iframe to confirm layout/spacing reads correctly to a human.
  Applies to the 5 pages added in the coverage-extension pass too.
- **6 of Anakin's 21 API operations deliberately left out** of the
  coverage-extension pass, all for scope reasons rather than technical
  ones -- see README.md's "Deliberately excluded" list for the reasoning
  per operation (`wire_write_action`, `wire_login`, `wire_identities`,
  `wire_build`, `session_delete`, `browser_task`). Short version: this app
  only exposes read-only research/monitoring operations that don't require
  storing a third-party credential or letting an AI act autonomously on a
  website on the merchant's behalf -- a materially different risk profile
  than the read operations it does expose.
- **Wire catalog, monitor, and session response shapes are rendered as raw
  JSON in the UI, not curated tables.** This isn't a UI shortcut so much as
  matching the ground truth's own uncertainty: `anakin-mcp/src/client.ts`
  itself types `wireCatalog`'s, `monitorCreate`'s, `monitorList`'s, and
  `sessionsList`'s return values as `unknown` / `Record<string, unknown>`
  rather than a concrete interface. Inventing field names to build a nicer
  table would be guessing at a shape no source available in this sandbox
  confirms -- the raw-JSON rendering is the honest choice, at the cost of a
  less polished-looking page for those three operations specifically.
  (`wire_discover`'s and `ai_visibility_search`'s responses *are* rendered
  as tables -- their field names are documented directly in the MCP tool
  descriptions, e.g. `action_id`/`type` for Wire results, `source`/
  `status`/`summary` for AI visibility results, so those aren't guesses.)
- **Monitor create/list/changes/control and AI-visibility search were only
  verified against a 401 (invalid key), not a real 200 success path** --
  same limitation as the original 3 operations had (no real Anakin account
  credit balance available in this sandbox). The 401 checks confirm
  endpoint paths, request shapes, and the `X-API-Key` header are correct
  against the live API; they don't confirm the exact shape of a
  *successful* monitor/search response, since this app deliberately
  doesn't assume one it can't verify (see the raw-JSON point above).

## Steps (needs the account owner)

1. Create or select a real Shopify Partner or Dev Dashboard organization.
2. From this directory: `npx shopify app init` won't re-scaffold over an
   existing directory -- instead run `shopify app config link` to connect
   this directory to a new or existing app record (interactive login
   required, the same device-code flow this session hit and couldn't
   complete).
3. `npm run dev` (wraps `shopify app dev`) -- creates a tunnel, installs on
   a chosen development store, and is the first point this app's OAuth/
   billing/webhook code actually runs against real Shopify infrastructure.
4. Flip `isTest: true` → conditional on `process.env.NODE_ENV !== "production"`
   in `app/routes/app._index.tsx` and `app.billing.tsx` before requesting
   real (non-test) billing approval from real merchants.
5. `shopify app deploy` to push `shopify.app.toml` (webhooks, billing-
   relevant config) to the real app record, then submit for App Store
   review through the Partner Dashboard if this is meant to be a public
   listing.
