# VehicleSearch — AI-Powered Facebook Marketplace Scanner

> **[🚀 Live Demo →](https://frontend-kappa-three-65.vercel.app)**
> *The demo shows the full UI. Live search requires the backend running locally with a Facebook session (see [Backend Setup](#backend-setup)).*

![VehicleSearch UI](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet%204.5-8B5CF6?logo=anthropic&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## What It Does

VehicleSearch is a full-stack used-car research tool that combines live Facebook Marketplace scraping with automated vehicle history checks and streaming AI analysis — all in one interface.

**Search** → Set make, model, year/price/mileage ranges, ZIP, radius, transmission  
**Auto-vet** → Every listing is checked against NHTSA recalls, NHTSA complaints, and NICB theft/salvage records  
**AI Analysis** → Claude streams a full report: reliability score, known pain points, mileage-specific maintenance, inspection checklist, seller questions, ownership costs, negotiation script, and a **BUY / CAUTION / AVOID** rating

---

## Features

### Core Search
- Cars.com-style filters: make, model, year range, price range, max mileage, ZIP + radius, transmission, condition, sort order
- Multi-ZIP nationwide search (up to 5 ZIP codes in parallel)
- Background job queue — search returns instantly, results stream in via polling
- 30-minute result cache — instant repeat searches

### Automatic Vehicle Vetting (per listing)
| Check | Source | Cost |
|-------|--------|------|
| Recall count + details | NHTSA Recalls API | Free |
| Consumer complaints | NHTSA Complaints API | Free |
| Theft / salvage flag | NICB VINCheck | Free |
| VIN decode (engine, transmission, drive, body) | NHTSA vPIC API | Free |
| Carfax / AutoCheck deep links | Affiliate links | Paid (user's choice) |
| State DMV title check | All 50 states | Free |

### AI Analysis (Claude claude-sonnet-4-6, streaming SSE)
- **BUY / CAUTION / AVOID** rating with 1–10 score bar
- Reliability summary for that specific year/make/model
- Known pain points and recall warnings
- Maintenance expectations at the listing's exact mileage
- Interactive inspection checklist (tap to strike through)
- Questions to ask the seller (per-item copy button)
- Ownership cost breakdown (annual maintenance estimate, common repair costs, insurance tier, fuel cost)
- Ready-to-send negotiation script (150–200 words)

### Market Intelligence
- Server-side **Deal Score** (0–100) on every card — no AI call required
- Market price estimate from listing set medians
- Price delta chip: *"$1,200 below market"* / *"$3,000 above market"*

### UI / UX
| Feature | Detail |
|---------|--------|
| Dark mode | `localStorage` + `prefers-color-scheme` init, smooth 150ms transitions |
| Comparison mode | Sticky tray + full-screen table across 12 metrics, max 4 vehicles |
| Financing calculator | Down payment, APR, 36/48/60/72-month terms → monthly payment + total cost |
| Similar listings | Top 3 from current results by same make/model or ±15% price, sorted by deal score |
| Saved searches | `localStorage`-backed dropdown, sanitized on load |
| Print / PDF export | `window.print()` with full `@media print` block |
| Skeleton loading | 6 shimmer cards while scraping (30–60s) |
| Freshness bar | "Results from X minutes ago" + one-click refresh |

---

## Architecture

```
fb-vehicle-search/
├── backend/                    # Python 3.11 · FastAPI · Playwright
│   ├── main.py                 # /api/search (202+polling), /api/analyze (SSE), /api/history/{vin}, /api/jobs/{id}
│   ├── scraper.py              # Playwright async FB Marketplace scraper
│   ├── vin_decoder.py          # NHTSA vPIC + recalls + complaints; VIN regex extractor
│   ├── ai_analysis.py          # Claude streaming analysis; prompt injection protection
│   ├── cache.py                # aiosqlite multi-table cache (search 30min, history 24h, AI 7d, decode ∞)
│   ├── security.py             # API key auth, VIN validation, URL safety, prompt sanitization
│   ├── nicb.py                 # Playwright NICB VINCheck (graceful fallback)
│   ├── jobs.py                 # Asyncio background job queue with SQLite persistence
│   ├── market_price.py         # Median price estimation, quick_score formula, DMV URLs
│   └── models.py               # Pydantic v2 models: SearchParams, Listing, VehicleHistory, AnalysisResult
│
└── frontend/                   # React 18 · Vite · TypeScript strict · Tailwind CSS v3
    └── src/
        ├── App.tsx             # Root: dark mode, saved searches, job polling, comparison state
        ├── api.ts              # Typed fetch wrappers, SSE consumer, isSafeUrl guard
        ├── types.ts            # TypeScript interfaces (mirrors backend Pydantic models)
        └── components/
            ├── SearchForm.tsx          # Sidebar filter panel
            ├── ListingGrid.tsx         # Card grid, skeleton loading, empty state
            ├── ListingCard.tsx         # Full card: image overlay, score badge, expand → AI
            ├── AiAnalysisPanel.tsx     # Tabbed: Overview / Issues / Maintenance / Inspect / Ask Seller
            ├── RatingBadge.tsx         # BUY/CAUTION/AVOID badge + score bar
            ├── DealScoreBadge.tsx      # Circular pre-AI score badge (green / amber / red)
            ├── HistoryBadges.tsx       # NHTSA recall/complaint + NICB pill badges
            ├── ComparisonTray.tsx      # Sticky tray + 12-metric comparison table
            ├── FinancingCalculator.tsx # Monthly payment calculator
            └── SimilarListings.tsx     # Top 3 similar vehicles from current results
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend framework | FastAPI (Python 3.11) with async/await throughout |
| Scraping | Playwright (async) — persistent logged-in FB profile |
| Vehicle history | NHTSA vPIC, NHTSA Recalls, NHTSA Complaints, NICB VINCheck |
| AI | Anthropic `claude-sonnet-4-6` via streaming SSE |
| Database | SQLite via `aiosqlite` (multi-table cache + job queue) |
| Rate limiting | `slowapi` per client IP |
| Frontend | React 18 + Vite + TypeScript (strict mode) |
| Styling | Tailwind CSS v3 (`darkMode: "class"`) |
| Streaming | Server-Sent Events (SSE) — raw chunks shown while streaming |

---

## Security

Enterprise-grade hardening applied throughout:

- **API key authentication** — `X-API-Key` header on every endpoint, `hmac.compare_digest` timing-safe compare
- **Rate limiting** — `slowapi` per client IP on all routes
- **Prompt injection protection** — `sanitise_for_prompt()` strips injection keywords; system prompt separates trusted vs. untrusted sections; model instructed to ignore embedded instructions
- **SSRF prevention** — NHTSA/NICB URLs built via `httpx params={}` (never f-strings); host allowlists; `follow_redirects=False`
- **URL injection** — `urllib.parse.urlencode()` for all FB query strings; `_assert_fb_host()` guard before Playwright navigation
- **XSS prevention** — `isSafeUrl()` scheme validation on every rendered external link
- **No secret leakage** — internal errors never exposed in responses; `/api/health` returns `{"status":"ok"}` only; OpenAPI docs hidden in production (`ENV=production`)
- **Request body size cap** — 512KB middleware limit
- **CORS** — exact origins only, GET + POST only, no credentials
- **Cryptographic job IDs** — `secrets.token_urlsafe(24)`, never guessable

---

## Backend Setup

### Prerequisites
- Python 3.11+
- Node.js 18+ (for frontend)
- A Facebook account

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...         # Get from console.anthropic.com
API_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(32))">
FB_PROFILE_PATH=./fb-profile
FB_HEADLESS=true
CACHE_DB_PATH=./cache.db
ENV=dev
ALLOWED_ORIGINS=http://localhost:5173
```

Also set `VITE_API_KEY` in `frontend/.env` to the same value as `API_KEY`.

### 3. Log into Facebook (one-time)

```bash
# In .env, temporarily set:
FB_HEADLESS=false

# Start the backend once — a real Chrome window opens:
uvicorn main:app --reload

# Run any search from the frontend. A Playwright browser window opens.
# Log into Facebook in that window.
# The session is saved to FB_PROFILE_PATH and reused forever.

# Set FB_HEADLESS=true again when done.
```

### 4. Run

```bash
# Backend (from /backend):
uvicorn main:app --reload      # → http://localhost:8000

# Frontend (from /frontend):
npm install
npm run dev                    # → http://localhost:5173
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Search listings. Returns `{listings}` if cached, or `{job_id}` (HTTP 202) for live scrape |
| `GET` | `/api/jobs/{job_id}` | Poll background job status: `pending` → `running` → `done` / `failed` |
| `POST` | `/api/analyze` | Stream AI analysis as SSE. Events: `chunk` (text), `result` (JSON), `error` |
| `GET` | `/api/history/{vin}` | Fetch NHTSA + NICB history for a VIN |
| `GET` | `/api/health` | Health check → `{"status": "ok"}` |

All endpoints require `X-API-Key` header.

---

## Cache TTLs

| Data | TTL | Rationale |
|------|-----|-----------|
| Search results | 30 minutes | FB listings change frequently |
| NHTSA history | 24 hours | Stable government data |
| AI analysis | 7 days | Expensive to regenerate |
| VIN decode | Permanent | Never changes |
| Market price | 12 hours | Moderate staleness acceptable |

---

## Deployment

The frontend is a standard Vite build — deploy to Vercel, Netlify, or any static host:

```bash
cd frontend
npm run build      # outputs to dist/
```

The backend requires Python 3.11, Playwright, and a persistent filesystem for the SQLite cache and FB browser profile. Suitable for a VPS (DigitalOcean, Linode, Hetzner) or a Docker container with a mounted volume.

> **Note:** Facebook Marketplace scraping requires an active Facebook session. The persistent Playwright profile stores session cookies — treat `FB_PROFILE_PATH` as sensitive and never commit it.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built spec-first with [Claude Code](https://claude.ai/code). Full product specification in [SPEC.md](SPEC.md). Session context for resuming development in [SESSION_CONTEXT.md](SESSION_CONTEXT.md).*
