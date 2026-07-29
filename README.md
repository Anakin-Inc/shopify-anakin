# shopify-anakin

An embedded Shopify app that brings [Anakin](https://anakin.io)'s web
scraping, site discovery, Wire marketplace actions, AI-visibility checks,
website monitoring, and AI search into the Shopify admin, so a merchant can
research a competitor, watch a price page, or check how AI engines describe
their brand without leaving Shopify.

Scaffolded from Shopify's own current, real template —
[`Shopify/shopify-app-template-react-router`](https://github.com/Shopify/shopify-app-template-react-router)
(the successor to the Remix template — see SUBMIT.md for why) — cloned live
and edited in place, the same "start from a real reference, not an
approximation" approach this session's tray-anakin/dagster-anakin
submissions used for their platforms.

## What's covered

Six pages, 15 of Anakin's 21 API capabilities — up from the original 3
(scrape, search, agentic_search). Each new page is its own Remix route
(`app/routes/app.*.tsx`), gated behind the same Shopify Billing subscription
via the shared `requireShopContext` helper in `app/anakin-shop.server.ts`,
and calling into `app/anakin.server.ts`'s hand-rolled Anakin client — see
"Anakin API surface" below and SUBMIT.md for exactly which endpoint each one
hits.

- **Market research** (`/app`) — the original page:
  - **Scrape a URL** — submits `POST /url-scraper`, then polls
    `GET /url-scraper/:jobId` until the job completes, and shows the page as
    markdown.
  - **AI search** — synchronous `POST /search`. No polling, 3 credits.
  - **Agentic research** — submits `POST /agentic-search`, then polls
    `GET /agentic-search/:jobId`; shows the AI-written summary. 10 credits.
- **Site explorer** (`/app/site-explorer`) — discover and bulk-fetch a
  competitor's site:
  - **Map a site** — `POST /map` → poll `GET /map/:jobId`. Discovers
    reachable URLs under a starting page.
  - **Crawl a site** — `POST /crawl` → poll `GET /crawl/:jobId`.
    Bulk-fetches markdown for up to `maxPages` pages; accepts an optional
    saved session ID for login-protected sites.
- **Wire actions** (`/app/wire`) — Anakin's catalog of pre-built per-site
  automations (Amazon, Walmart, LinkedIn, and hundreds more), read side
  only:
  - **Find an action** — `GET /wire/resolve`, natural-language → candidate
    actions.
  - **Browse the catalog** — `GET /wire/catalog` or `/wire/catalog/:slug`.
  - **Run a read action** — `POST /wire/task` → poll `GET /wire/jobs/:id`.
    Extracts data (price, specs, reviews, listings) without a state change.
- **AI visibility** (`/app/ai-visibility`) — how AI engines describe your
  brand:
  - **Ask AI engines** — `POST /ai-visibility/search` → poll
    `GET /ai-visibility/search/:searchId`. Compares ChatGPT/Gemini/AI
    Overview answers to the same question, plus a synthesis of where they
    agree/diverge.
  - **List engines** — `GET /ai-visibility/sources`.
- **Monitors** (`/app/monitors`) — watch a competitor's page on a schedule:
  - **Create** — `POST /monitors` (min 15-minute interval; full-page or
    AI-extracted specific-data watch modes).
  - **List** — `GET /monitors`.
  - **Changes** — `GET /monitors/:id/changes`.
  - **Pause / resume / run now / delete** — `POST /monitors/:id/pause` |
    `/resume` | `/run`, `DELETE /monitors/:id`.
- **Sessions** (`/app/sessions`) — `GET /sessions`, read-only: lists saved
  browser sessions whose IDs plug into Site explorer's Crawl form for
  login-protected pages.

### Deliberately excluded (6 of 21)

- **`wire_write_action`, `wire_login`, `wire_identities`** — Wire's
  state-changing/auth half. This is a merchant-facing research app; letting
  it submit forms or sign into third-party accounts on a competitor's site
  is a different (and much riskier) product than "look things up," and none
  of the read actions this app exposes need a credential.
- **`wire_build`** — requests a brand-new scraper be generated for an
  unlisted site. A power-user/developer operation, not something a
  merchant researching competitors needs day-to-day.
- **`session_delete`** — destructive, and sessions can only be *created*
  from Anakin's own dashboard anyway (see the Sessions page's aside) — this
  app's session support is read-only by design.
- **`browser_task`** — free-form AI browser automation. Out of scope for
  the same reason as the write-side Wire tools: too open-ended for a
  scoped research/monitoring app, and easy to misuse for exactly the kind
  of "have an AI click around a website unsupervised" risk a merchant app
  shouldn't casually expose.

Plus the three things a real Shopify app needs around those operations:

- **OAuth / install flow** — real `@shopify/shopify-app-react-router`
  library (token exchange for embedded installs, authorization-code grant
  as fallback, HMAC-verified webhooks) — not hand-rolled. See
  `app/shopify.server.ts` and `app/routes/auth.$.tsx` /
  `app/routes/auth.login/route.tsx`.
- **Billing** — a real GraphQL Billing API subscription
  (`appSubscriptionCreate` under the hood) gates the page:
  `app/routes/app._index.tsx`'s loader calls `billing.require(...)`; a
  `/app/billing` page (`app/routes/app.billing.tsx`) shows/cancels the
  active plan via `billing.check()` / `billing.cancel()`.
- **Mandatory GDPR compliance webhooks** — `customers/data_request`,
  `customers/redact`, `shop/redact` are wired and handled for real (see
  `app/routes/webhooks.customers.*` and `webhooks.shop.redact.tsx`), not
  left as commented-out TODOs.

## Install

```sh
npm install
npx prisma generate
npx prisma migrate deploy
```

`npm install` and the two Prisma commands were run for real against this
repo's actual `package.json`/`prisma/schema.prisma` while building it — see
SUBMIT.md for the exact output.

## Local development

This app needs a real Shopify Partner/Dev Dashboard organization to run
`shopify app dev` against (device-code browser login, then a real app
record for `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`) — see SUBMIT.md for why
that step couldn't be completed in this sandbox. Once you have one:

```sh
npm run dev
```

Or without the CLI (e.g. behind a reverse proxy you already run), copy
`.env.example` to `.env`, fill in real values, and:

```sh
npm run build && npm run start
```

## Test

```sh
npm run typecheck   # react-router typegen && tsc --noEmit
npm run lint
npm run build
```

All three pass clean against this repo as committed — see SUBMIT.md for
the actual command output, plus a real local server run that exercised
`/`, `/app`, `/auth`, `/auth/login`, and the `/webhooks/shop/redact` HMAC
check end to end.

## Anakin API key

Each shop pastes its own Anakin API key into the app (`ShopSettings` table,
one row per shop — see `prisma/schema.prisma`); it's billed by Anakin's own
credit system, separate from this app's own Shopify subscription. Get a
free key with 300 credits, no card required, at
[anakin.io/dashboard](https://anakin.io/dashboard).

## Steps (needs the account owner)

1. Create an app in a real Shopify Partner or Dev Dashboard organization
   (`shopify app config link` against this directory, or
   `shopify app init` fresh).
2. Fill in the resulting `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET` (the CLI
   does this for you via `shopify app dev`; see `.env.example` for the
   manual-deploy path).
3. `shopify app deploy` to push `shopify.app.toml`'s webhook subscriptions
   and billing config to the real app record.
4. Install on a development store to exercise the real OAuth/token-exchange
   flow end to end — unverified in this sandbox, see SUBMIT.md.
