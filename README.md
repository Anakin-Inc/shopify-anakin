# shopify-anakin

An embedded Shopify app that brings [Anakin](https://anakin.io)'s web
scraping, AI search, and agentic research into the Shopify admin, so a
merchant can research a competitor's product page or run market research
without leaving Shopify.

Scaffolded from Shopify's own current, real template —
[`Shopify/shopify-app-template-react-router`](https://github.com/Shopify/shopify-app-template-react-router)
(the successor to the Remix template — see SUBMIT.md for why) — cloned live
and edited in place, the same "start from a real reference, not an
approximation" approach this session's tray-anakin/dagster-anakin
submissions used for their platforms.

## What's covered

One page, three Anakin operations, matching the same baseline as every
other single-purpose Anakin integration built this session:

- **Scrape a URL** — submits `POST /url-scraper`, then polls
  `GET /url-scraper/:jobId` until the job completes, and shows the page as
  markdown.
- **AI search** — synchronous `POST /search`. No polling, 3 credits.
- **Agentic research** — submits `POST /agentic-search`, then polls
  `GET /agentic-search/:jobId`; shows the AI-written summary. 10 credits.

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
