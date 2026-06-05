# Session Context — FB Vehicle Search

This file gives a Claude Code session full context to resume work cold.

## What This App Does

Full-stack used-vehicle search tool that:
1. Scrapes **Facebook Marketplace** listings with Cars.com-style filters (make, model, year range, price, mileage, ZIP/radius, transmission, condition)
2. Auto-vets each listing via **free public APIs**: NHTSA recalls, NHTSA complaints, NICB VINCheck (theft/salvage)
3. Runs **streaming Claude AI analysis** per listing: reliability score, known pain points, mileage-specific maintenance, inspection checklist, seller questions, BUY/CAUTION/AVOID rating with score bar
4. Computes **server-side deal scores** (0–100), market price estimates, and price delta chips

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI, Pydantic v2, Playwright (async), aiosqlite, slowapi, httpx |
| AI | Anthropic `claude-sonnet-4-6` via streaming SSE |
| Frontend | React 18, Vite, TypeScript strict, Tailwind CSS v3 |
| APIs | NHTSA vPIC, NHTSA Recalls, NHTSA Complaints, NICB VINCheck |

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
playwright install chromium
cp ../.env.example .env          # fill in ANTHROPIC_API_KEY, API_KEY, FB_PROFILE_PATH
uvicorn main:app --reload        # → localhost:8000

# First-time FB login (only needed once):
# Set FB_HEADLESS=false in .env, run a search, log into Facebook in the Playwright window.
# Profile persists at FB_PROFILE_PATH for all future headless runs.

# Frontend
cd frontend
npm install
npm run dev                      # → localhost:5173
```

## Environment Variables (see `.env.example`)

| Var | Description |
|-----|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (`sk-ant-...`) |
| `API_KEY` | Random secret for X-API-Key auth — generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `VITE_API_KEY` | Must match `API_KEY` (sent by frontend) |
| `FB_PROFILE_PATH` | Path to Playwright persistent profile dir (default `./fb-profile`) |
| `FB_HEADLESS` | `true` in prod, `false` for first-time FB login |
| `CACHE_DB_PATH` | SQLite file path (default `./cache.db`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `http://localhost:5173`) |
| `ENV` | `dev` or `production` (hides OpenAPI docs in production) |
| `PROXY_LIST` | Optional comma-separated `http://user:pass@host:port` proxies for scraping |

## File Map

```
fb-vehicle-search/
├── SPEC.md                        # Full product spec (written spec-first)
├── SESSION_CONTEXT.md             # This file
├── .env.example                   # All env vars documented
├── .gitignore
│
├── backend/
│   ├── main.py                    # FastAPI: /api/search, /api/analyze (SSE), /api/history/{vin}, /api/jobs/{id}, /api/health
│   ├── models.py                  # Pydantic v2 models: SearchParams, Listing, VehicleHistory, AnalysisResult, JobResponse, OwnershipCost
│   ├── scraper.py                 # Playwright FB Marketplace scraper (search + listing detail)
│   ├── vin_decoder.py             # NHTSA vPIC decode, recalls, complaints; VIN regex extractor
│   ├── ai_analysis.py             # Claude streaming analysis; prompt builder with prompt-injection protection
│   ├── cache.py                   # aiosqlite multi-table cache (search 30min, history 24h, analysis 7d, decode permanent)
│   ├── security.py                # API key auth, VIN validation, URL safety, prompt sanitization, request body size limit
│   ├── nicb.py                    # Playwright NICB VINCheck (theft/salvage flag)
│   ├── jobs.py                    # Asyncio background job queue with SQLite persistence
│   ├── market_price.py            # Median price from listing set, price delta %, quick_score, DMV title check URLs, Carfax/AutoCheck links
│   └── requirements.txt
│
└── frontend/
    ├── vite.config.ts             # Proxy /api → localhost:8000
    ├── tailwind.config.js         # darkMode: "class", custom indigo palette, pulse-slow animation
    ├── src/
    │   ├── App.tsx                # Root: dark mode, saved searches, job polling, comparison state, freshness bar
    │   ├── api.ts                 # fetch wrappers (X-API-Key header, AbortSignal timeouts, SSE consumer, isSafeUrl)
    │   ├── types.ts               # All TypeScript interfaces
    │   ├── index.css              # Skeleton shimmer, dark mode transitions, @media print block, custom scrollbar
    │   └── components/
    │       ├── SearchForm.tsx         # Sidebar: make/model/year/price/mileage/ZIP/radius/transmission/sort filters
    │       ├── ListingGrid.tsx        # Grid + skeleton loading (6 cards) + illustrated SVG empty state
    │       ├── ListingCard.tsx        # Card: image overlay, deal score, price delta chip, expand → details + AI
    │       ├── AiAnalysisPanel.tsx    # Tabbed: Overview / Issues / Maintenance / Inspect / Ask Seller + print block
    │       ├── RatingBadge.tsx        # BUY/CAUTION/AVOID badge with score bar + price assessment chip
    │       ├── HistoryBadges.tsx      # Pill badges: recall count, open recalls, NICB flag, complaint count
    │       ├── DealScoreBadge.tsx     # Circular score badge (emerald ≥70, amber 40–69, red <40)
    │       ├── FinancingCalculator.tsx # Collapsible: down payment, APR, term → monthly payment + total cost
    │       ├── SimilarListings.tsx    # Top 3 similar from current results by make/model or ±15% price
    │       └── ComparisonTray.tsx     # Sticky tray + full-screen table comparing up to 4 vehicles (12 metrics)
```

## Security Hardening (Enterprise-Grade)

All of the following were explicitly implemented:

- **API key auth** (`X-API-Key` header, `hmac.compare_digest` timing-safe compare) on every endpoint
- **Rate limiting** via `slowapi` per client IP
- **Input validation** — Pydantic v2 strict field validators (ZIP regex, VIN charset, URL scheme, enum constraints)
- **Prompt injection protection** — `sanitise_for_prompt()` strips injection keywords; prompt separates trusted vs untrusted sections; system prompt instructs model to ignore embedded instructions
- **SSRF prevention** — NHTSA/NICB URLs built via `httpx params={}` (never f-strings); host allowlists; `follow_redirects=False`
- **URL injection** — `urllib.parse.urlencode()` for all FB Marketplace query strings; `_assert_fb_host()` guard before Playwright navigation
- **XSS prevention** — `isSafeUrl()` scheme validation on all rendered external links
- **Proxy security** — private IP ranges blocked, credentials never logged, scheme validated
- **No secret leakage** — internal errors never exposed in responses; `/api/health` returns `{"status":"ok"}` only; OpenAPI docs hidden in production
- **Request body size cap** — 512KB middleware limit
- **CORS** — exact origins only, GET+POST only, no credentials
- **Structured logging** — no raw user-controlled values in logs
- **Background jobs** — IDs are `secrets.token_urlsafe(24)`; errors never exposed in status responses

## Key Design Decisions

- **No FB API exists** → Playwright with persistent logged-in profile. Update CSS selectors in `scraper.py` when FB changes its DOM.
- **VIN not always in listings** → regex on description text; fallback gracefully with "No VIN" badge.
- **NICB blocks automation** → graceful `None` fallback; user sees "check unavailable" not an error.
- **Client could forge history** → `/api/analyze` discards client-supplied history, re-fetches from cache/NHTSA server-side.
- **Expensive scrapes block threads** → background job queue returns HTTP 202 immediately; frontend polls every 2.5s.
- **Deduplication** → VIN-based + (year/make/model + price ±$500) fallback.
- **Multi-ZIP search** → `zip_codes` field (max 5), `Semaphore(2)` concurrency, 100-listing total cap.

## Features Implemented (all 20)

1. Market price estimation from listing set medians
2. NICB VINCheck (theft/salvage) via Playwright
3. All-50-state DMV title check URL generator
4. Carfax + AutoCheck affiliate deep links
5. Server-side `quick_score` (0–100) formula
6. AI ownership cost breakdown (maintenance estimate, common repairs, insurance tier, fuel cost)
7. AI negotiation script (150-200 word ready-to-send message)
8. VIN-based + price-similarity deduplication
9. Multi-ZIP nationwide search with concurrency limit
10. Background job queue (HTTP 202 + polling)
11. Proxy rotation with private-IP blocking
12. `scraped_at` timestamp + freshness bar with Refresh button
13. Circular deal score badge on every card (pre-AI)
14. Side-by-side comparison mode (sticky tray + full-screen table, max 4)
15. Financing calculator (down payment, APR, term → monthly + total)
16. Similar listings panel (same make/model or ±15% price, top 3)
17. Saved searches (localStorage, sanitized on load, dropdown UI)
18. Print/PDF export (`window.print()` with full `@media print` CSS)
19. Dark mode (localStorage + `prefers-color-scheme` init, smooth transitions)
20. Skeleton shimmer loading cards + illustrated SVG empty state

## Cache TTLs

| Data | TTL |
|------|-----|
| Search results | 30 minutes |
| VIN history (NHTSA) | 24 hours |
| AI analysis | 7 days |
| VIN decode | Permanent |
| Market price | 12 hours |

## AI Analysis Schema (AnalysisResult)

```typescript
{
  buy_rating: "BUY" | "CAUTION" | "AVOID",
  score: number,           // 1–10
  reliability_summary: string,
  known_issues: string[],
  recall_warnings: string[],
  maintenance_at_mileage: string[],
  inspection_checklist: string[],
  questions_for_seller: string[],
  buy_rationale: string,
  price_assessment: "underpriced" | "fair" | "overpriced" | "unknown",
  ownership_cost: {
    annual_maintenance_estimate: string,
    common_repair_costs: string[],
    insurance_tier: string,
    fuel_cost_annual_estimate: string,
  },
  negotiation_script: string,
}
```
