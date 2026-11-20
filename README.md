# understudy.consulting

[![verify](https://github.com/sorry2befrank/understudy/actions/workflows/verify.yml/badge.svg)](https://github.com/sorry2befrank/understudy/actions/workflows/verify.yml)

The public website for Understudy, my consulting business: AI consulting, small software builds, and AI training for organizations. Live at **https://understudy.consulting**.

It is a static site with no build step. GitHub Pages serves the HTML, CSS and JavaScript in this repo as they are. Anything that needs a server, such as taking a payment or storing a sign-up, goes to a separate checkout service on Render. That service is not in this repo.

I'm Frank Epps. I served in the US Air Force as an Electrical & Environmental Systems Specialist. From October 2020 to May 2025 I was an Integration Engineer at Blue Origin, where I progressed from wire harness assembler to I&C technician. After that I worked at Archer on eVTOL aircraft and at Foundation on humanoid robots (teleoperation and policy training). I build complete connected systems. I write them with Claude, Ollama and Codex, and I check the AI-written code with tests. This repo is a small example of that: a plain static site with a test suite that pins down the facts the business depends on, such as prices, booking links, payment behavior and privacy rules.

## What is interesting here

- **Payment links carry a token, not a price.** A payment link looks like `pay.html#<64 hex characters>`. The browser sends only that token to the checkout service. The service looks up the agreed service and amount and returns them to the page, so nobody can change the price by editing a URL. The browser only ever holds Stripe's publishable key.
- **Referral tracking that keeps no personal data.** The site records where a visitor came from (for example ChatGPT, Google or Bing), and it keeps only that rough source plus the page they landed on. Arbitrary query strings, full referrer URLs and email addresses are never stored.
- **Tests that guard the business, not just the code.** Retired prices, links to checkout from pages that should not have them, and broken internal links all fail the build.

## Architecture

```
Browser (GitHub Pages, static)                 Render (separate repo)          Third parties
--------------------------------               -----------------------         -------------------
index.html, work-with-me.html, ...  --------->                                 Cal.com embed
  booking pages embed Cal.com                                                  (diagnosis, consultation)

pay.html#<token>                    -- POST -->  /api/understudy/checkout  --> Stripe Checkout Session
  payment.js sends { token }                      looks up service + amount     (embedded mode)
  Stripe.js mounts embedded checkout <-- clientSecret, label, amount, status

founders.html (email list form)     -- POST -->  lead route (no auto-email)
discovery-attribution.js            sessionStorage only, nothing sent on its own
```

| File | Role |
| --- | --- |
| `index.html` | Home page: two classes, each linked to a fixed Stripe Payment Link |
| `work-with-me.html`, `book.html`, `consult.html`, `start-a-build.html` | Services hub and the Cal.com booking pages |
| `pricing.html` | The price list, with no buy buttons |
| `pay.html`, `payment.js`, `payment.css` | Page for tokenized one-time payments |
| `discovery-attribution.js` | Referral tracking that stores no personal data |
| `founders.html` | Email list sign-up form, with a honeypot field to catch bots |
| `build.html`, `landing-v2.html`, `classes.html` | Retired URLs. Each forwards to its current page and keeps the query string. They are marked `noindex`. |
| `site-2026.css`, `site-nav.js`, `service-pages.js` | Shared styles, navigation and the light/dark theme switch |
| `sitemap.xml`, `robots.txt`, `CNAME` | Search engine files and the custom domain |

### Payments

`payment.js` runs these steps:

1. It reads the token from `location.hash`. If the token does not match `^[a-f0-9]{64}$`, the page tells the visitor to use the link Frank sent and makes no request. The token is in the hash fragment, so it never reaches GitHub Pages' server logs.
2. It sends `POST /api/understudy/checkout` with `{ token, viewOnly: true }`. The service replies with the label, amount and status (`open`, `processing` or `paid`), and the page shows that amount.
3. When the visitor clicks Continue, the page loads Stripe.js and sends the same request without `viewOnly`. It then mounts Stripe's embedded checkout with the returned `clientSecret`.
4. When Stripe reports that checkout is complete, the page asks the service for the status again instead of trusting the browser. A `paid` or `processing` status removes the pay button, so a second click cannot charge the visitor twice.

The browser never sends an amount or an email address. The Playwright suite checks that on every request payload.

### Referral tracking

`discovery-attribution.js` runs only on a fixed list of public pages. It works out a source from `utm_source` or the referrer hostname, and it accepts only six values: `chatgpt`, `google`, `bing`, `perplexity`, `google-business` and `direct`. It stores `{ source, landing, at }` in `sessionStorage` and nothing else. A stored value is thrown away if it is malformed, comes from an unknown source or landing page, carries a timestamp in the future, or is more than 30 minutes old. A lookalike host such as `chatgpt.com.evil.example` is not counted as ChatGPT. The script adds coarse UTM tags to booking links on the same site so that Cal.com can record the source.

The unit tests run the real script inside a `node:vm` sandbox, with fake `window`, `document` and `sessionStorage` objects. That makes it possible to test spoofed referrers, corrupt storage, storage that throws an error, 30-minute expiry, and the rule that `email=` and `token=` query parameters never reach storage or rewritten links.

## Running it

Requirements: Node 22 or later.

```sh
npm ci
npx playwright install chromium            # first time only
PW_BUNDLED_CHROMIUM=1 npm run verify       # unit tests, then browser tests, using that Chromium
```

`PW_BUNDLED_CHROMIUM=1` tells Playwright to use the Chromium it just downloaded, which is what CI does. Without it, `playwright.config.mjs` uses your installed Google Chrome (`channel: 'chrome'`), and the browser tests fail on a machine that has no Chrome. In Windows PowerShell, set it first with `$env:PW_BUNDLED_CHROMIUM = '1'`.

To view the site, run `node tests/static-server.mjs` and open http://127.0.0.1:4387. The static server refuses any path that resolves outside the repo.

## Tests

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit tests (`node:test` + `htmlparser2`) | `npm test` | 21 tests. They check that every marketing page has a unique title, a description, one canonical URL and one `h1`. Structured data must not invent an address, reviews or certifications. The sitemap must list only canonical pages. Every local link and asset must resolve, including `#fragment` targets, on **every** `.html` file in the repo. No page may contain retired price wording, including old monthly founding-member rates. Stripe Payment Links may appear only on the home page and must match the two approved URLs. The referral tracking cases described above are also covered. |
| Browser tests (Playwright) | `npm run test:browser` | 42 tests. The service pages are checked at 360px, 768px and 1440px for horizontal overflow, clipped headings and buttons, and images that fail to load. Every page in the navigation is checked at 360px: the dark theme must hold even when the browser prefers light mode, buttons must be at least 48px tall, `aria-current` must be set correctly, and the focus outline must be visible. The pay page runs through the full flow at 360px and 1440px against a fake Stripe.js and a mocked checkout service: open, processing, paid, reload, then expired and unreachable links. Other tests check keyboard-accessible navigation, the booking flow with JavaScript turned off, that referral tags reach the Cal.com embed, that the email list form keeps its honeypot field, and that retired URLs forward with their query string. |

The browser tests never contact the checkout service, Cal.com or Stripe. All three are stubbed with `page.route`. Google Fonts still load over the network.

The workflow in `.github/workflows/verify.yml` runs `npm run verify` on every push and pull request (Ubuntu, Node 22, bundled Chromium).

## Status and limits

- **Live.** The site at understudy.consulting is served from this repo through GitHub Pages.
- **The checkout service is not here.** The payment tests cover only the browser's side of the exchange against a mocked service. One browser test needs that service's source code and is skipped unless you set `UNDERSTUDY_ENGINE_ROOT`. A normal run reports 41 passed and 1 skipped.
- **The CSS is a set of separate stylesheets** (`site-2026.css`, `interior.css`, `rebrand.css`, `service-pages.css`) that built up as the site was redesigned. There is no bundler and no minification.
- **The tests check exact copy.** Many assertions match the exact wording of prices and offers, so changing a price or an offer means changing the tests too. That is on purpose: a price change should never ship without someone noticing.
- **Referral tracking is a best guess.** Visitors can set `utm_source` to anything, and the code says so. It is used to see roughly where visitors come from, never to identify anyone.
