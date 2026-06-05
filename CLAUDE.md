# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

FB Vehicle Search — scrapes Facebook Marketplace used-car listings, auto-pulls NHTSA recalls/complaints and NICB theft/salvage history per VIN, and provides streaming Claude AI analysis per listing (reliability, known issues, maintenance expectations, inspection checklist, seller questions, buy/caution/avoid rating).

## Dev Commands

### Backend (Python/FastAPI)
```bash
cd backend
pip install -r requirements.txt
playwright install chromium          # one-time: install headless browser
cp ../.env.example .env              # fill in ANTHROPIC_API_KEY + FB_PROFILE_PATH
uvicorn main:app --reload            # → localhost:8000
```

First run: set `FB_HEADLESS=false` in `.env`, then run a test search so Playwright opens a real Chrome window — log into Facebook there. That profile persists for all future headless runs.

### Frontend (React/Vite)
```bash
cd frontend
npm install
npm run dev          # → localhost:5173 (proxies /api → localhost:8000)
npm run typecheck
npm run build
```

## Architecture

See `SPEC.md` for the full product specification, data models, API contracts, and implementation phases.

```
backend/
  main.py         — FastAPI app: /api/search, /api/analyze (SSE), /api/history/{vin}, /api/health
  scraper.py      — Playwright async scraper for FB Marketplace (search + detail pages)
  vin_decoder.py  — NHTSA vPIC VIN decode; NHTSA recalls + complaints; VIN regex extractor
  ai_analysis.py  — Claude claude-sonnet-4-6 streaming analysis; prompt builder
  cache.py        — aiosqlite cache (search 30min TTL, history 24h, analysis 7d, decode permanent)
  models.py       — All Pydantic models (SearchParams, Listing, VehicleHistory, AnalysisResult, …)

frontend/src/
  App.tsx                     — Root: search state, calls searchListings(), passes to SearchForm + ListingGrid
  api.ts                      — Typed fetch wrappers: searchListings(), analyzeListingStream() (SSE consumer)
  types.ts                    — All TypeScript interfaces mirroring backend Pydantic models
  components/
    SearchForm.tsx            — Sidebar with all filter controls; emits SearchParams
    ListingGrid.tsx           — Card grid + empty/loading/error states
    ListingCard.tsx           — Single listing: image, stats, expand → description + VIN details + history + AI
    HistoryBadges.tsx         — Colored pill badges for recalls, open recalls, NICB flags, complaint count
    AiAnalysisPanel.tsx       — Streaming analysis UI: idle → loading → streaming (raw text) → done (structured)
    RatingBadge.tsx           — BUY/CAUTION/AVOID badge with score bar and price assessment chip
```

## Key Design Decisions

- **No FB API** — Playwright scrapes with a persistent logged-in profile. CSS selectors are in `scraper.py`; update them there when FB changes its DOM.
- **VIN extraction** — regex `\b[A-HJ-NPR-Z0-9]{17}\b` on listing description text; false-positive filtered by charset diversity.
- **Streaming analysis** — `/api/analyze` returns SSE. Frontend consumes via `ReadableStream` in `api.ts:analyzeListingStream`. Raw chunks shown while streaming; structured `AnalysisResult` emitted as a final `result` event.
- **Cache TTL** — search results 30 min (FB data changes fast), VIN history 24h (NHTSA is stable), AI analysis 7 days (expensive to regenerate), VIN decode permanent (never changes).
- **Model** — `claude-sonnet-4-6`, temperature 0 for factual/deterministic output. Prompt is in `ai_analysis.py:_build_prompt`.
