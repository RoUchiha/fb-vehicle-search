# FB Vehicle Search — Product Specification

## 1. Problem Statement

Facebook Marketplace is one of the largest used-car listing platforms, but it has no structured search (no filter by mileage, trim, accident history, etc.), no vehicle history integration, and no AI-assisted buyer guidance. This app layers all of that on top of Marketplace listings.

---

## 2. Goals

1. Scrape FB Marketplace used-car listings based on structured search criteria (make, model, year range, price range, mileage, zip/radius, transmission, condition).
2. Auto-vet each listing by pulling free public vehicle history data (NHTSA recalls, NHTSA complaints, NICB theft/salvage check via VIN).
3. Provide per-listing AI analysis powered by Claude covering: reliability, known pain points, expected maintenance at the listed mileage, inspection checklist, seller questions, and an overall Buy/Caution/Avoid rating with rationale.
4. Present results in a clean, searchable, sortable UI resembling Cars.com / CarGurus.

---

## 3. Non-Goals (v1)

- Paid Carfax / AutoCheck integration (blocked by cost; NHTSA + NICB are free).
- User accounts / saved searches / alerts.
- Mobile app.
- Production deployment / auth.

---

## 4. Architecture

```
fb-vehicle-search/
├── SPEC.md                  ← this file
├── backend/
│   ├── main.py              ← FastAPI app entrypoint
│   ├── scraper.py           ← Playwright-based FB Marketplace scraper
│   ├── vin_decoder.py       ← VIN decode + NHTSA API calls
│   ├── history.py           ← Vehicle history aggregation (recalls, complaints, NICB)
│   ├── ai_analysis.py       ← Claude API analysis logic
│   ├── models.py            ← Pydantic data models
│   ├── cache.py             ← SQLite cache layer
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts           ← typed fetch wrappers for backend endpoints
│       ├── types.ts         ← shared TypeScript interfaces
│       └── components/
│           ├── SearchForm.tsx
│           ├── ListingGrid.tsx
│           ├── ListingCard.tsx
│           ├── HistoryBadges.tsx
│           ├── AiAnalysisPanel.tsx
│           └── RatingBadge.tsx
└── .env.example
```

### Data Flow

```
User fills SearchForm
  → POST /api/search  (backend)
    → Playwright scrapes FB Marketplace (headless Chromium)
    → For each listing: extract VIN from title/description if present
    → vin_decoder: NHTSA vPIC API to confirm make/model/year
    → history: NHTSA Complaints API + NHTSA Recalls API + NICB VIN check
    → Results cached in SQLite by (VIN or listing_id, fetched_at)
  ← Returns array of Listing objects
  
User clicks "AI Analysis" on a card
  → POST /api/analyze  (backend)
    → Assembles context: listing details + decoded VIN data + history summary
    → Claude claude-sonnet-4-6 streaming response
  ← Streams AnalysisResult chunks to frontend
```

---

## 5. Data Models

### SearchParams
```
make: string | null
model: string | null
year_min: int | null
year_max: int | null
price_min: int | null
price_max: int | null
mileage_max: int | null
zip_code: string
radius_miles: int          # 10 | 25 | 50 | 100 | 200 | 500
transmission: "any" | "automatic" | "manual"
condition: "any" | "excellent" | "good" | "fair"
sort_by: "price_asc" | "price_desc" | "mileage_asc" | "newest" | "relevance"
```

### Listing
```
listing_id: str            # FB Marketplace listing ID
url: str
title: str
price: int | null          # USD
year: int | null
make: str | null
model: str | null
trim: str | null
mileage: int | null
location: str
seller_name: str
seller_type: "private" | "dealer" | "unknown"
posted_at: str | null      # ISO date string
images: list[str]          # image URLs
description: str
vin: str | null            # extracted from listing text
decoded_vin: DecodedVIN | null
history: VehicleHistory | null
```

### DecodedVIN
```
vin: str
make: str
model: str
year: int
trim: str | null
engine: str | null
transmission: str | null
drive_type: str | null     # FWD / RWD / AWD / 4WD
body_style: str | null
plant_country: str | null
```

### VehicleHistory
```
vin: str
recall_count: int
open_recall_count: int     # recalls not yet addressed
recalls: list[Recall]
complaint_count: int
complaints: list[Complaint]
nicb_stolen: bool | null   # null if VIN not found
nicb_salvage: bool | null
fetched_at: str            # ISO datetime
```

### Recall
```
recall_id: str
component: str
summary: str
consequence: str
remedy: str
date: str
```

### Complaint
```
odometer: int | null
incident_date: str | null
component: str
summary: str
```

### AnalysisResult
```
listing_id: str
reliability_summary: str       # 2-3 sentences on this make/model/year's rep
known_pain_points: list[str]   # bulleted known issues
maintenance_at_mileage: list[str]  # what's due or overdue at this odometer
inspection_checklist: list[str]    # things to physically inspect
seller_questions: list[str]        # questions to ask before buying
recall_warnings: list[str]         # plain-English open recall summaries
buy_rating: "BUY" | "CAUTION" | "AVOID"
buy_score: int                     # 1-10
buy_rationale: str                 # 3-5 sentences explaining the rating
price_assessment: "underpriced" | "fair" | "overpriced" | "unknown"
```

---

## 6. Backend API Endpoints

### POST /api/search
Request: `SearchParams`  
Response: `{ listings: Listing[], total: int, cached: bool }`  
- Runs Playwright scrape (or returns cached results < 30 min old)
- Strips listings that don't match numeric filters (price, mileage, year)
- Extracts VIN from listing text using regex + heuristics
- Fires NHTSA + NICB calls for any extracted VINs (async, parallel)

### POST /api/analyze
Request: `{ listing_id: str, listing: Listing }`  
Response: Server-Sent Events stream of `AnalysisResult` JSON chunks  
- Builds a structured prompt from listing + history data
- Streams Claude response
- Caches completed analysis by listing_id

### GET /api/history/{vin}
Response: `VehicleHistory`  
- Returns cached history or fetches fresh

### GET /api/health
Response: `{ status: "ok", playwright: bool, claude: bool }`

---

## 7. Scraping Strategy

Facebook Marketplace does not have a public API. The scraper uses Playwright (headless Chromium) to:

1. Navigate to `https://www.facebook.com/marketplace/category/vehicles` with location/radius params in the URL.
2. Apply filters via URL query params where possible (`minPrice`, `maxPrice`, `minYear`, `maxYear`, `maxMileage`, `make`, `model`, `transmission`).
3. Scroll to load paginated results (FB uses infinite scroll).
4. Parse listing cards: extract title, price, mileage, location, thumbnail, listing URL.
5. For each listing URL, open detail page: extract full description, all images, seller info, posted date.
6. Parse VIN from description text using regex: `\b[A-HJ-NPR-Z0-9]{17}\b`.

**Anti-detection notes:**
- Uses a real user-agent and viewport.
- Adds random delays between page loads (1–3 seconds).
- Respects `robots.txt` (FB Marketplace is listed there — this is for personal/research use).
- Requires user to be logged into Facebook in the browser profile used. The scraper uses a persistent browser profile path (configurable via env) so the user logs in once.

---

## 8. Vehicle History APIs (all free)

### NHTSA vPIC — VIN Decode
`GET https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{vin}?format=json`
Parses: make, model, year, trim, engine, transmission, drive type, body style.

### NHTSA Recalls
`GET https://api.nhtsa.gov/recalls/recallsByVehicle?make={make}&model={model}&modelYear={year}`
Returns all NHTSA safety recalls for the vehicle.

### NHTSA Complaints
`GET https://api.nhtsa.gov/complaints/complaintsByVehicle?make={make}&model={model}&modelYear={year}`
Returns consumer complaints filed with NHTSA.

### NICB VINCheck
`POST https://www.nicb.org/vincheck` (form submission, parsed via Playwright)
Returns whether VIN appears in stolen/salvage databases.

---

## 9. AI Analysis Prompt Design

The analysis prompt sent to Claude includes:

```
You are an expert used car advisor. Analyze this listing and provide a structured assessment.

LISTING:
- {year} {make} {model} {trim}
- Price: ${price} | Mileage: {mileage:,} miles
- Seller: {seller_name} ({seller_type})
- Location: {location}
- Description: {description}

VEHICLE HISTORY (NHTSA + NICB):
- Recalls: {recall_count} total, {open_recall_count} open
  {recall summaries}
- Complaints: {complaint_count} filed
  {top complaint categories}
- Stolen/Salvage flag: {nicb result}

Respond in JSON matching this schema: {AnalysisResult schema}
```

Model: `claude-sonnet-4-6`  
Temperature: 0 (deterministic, factual)  
Max tokens: 2000  
Cache: analysis cached by listing_id + vin (or listing_id if no VIN)

---

## 10. Frontend UX

### Search Form (sidebar)
- Make dropdown (populated from a static list of common makes)
- Model text input (auto-populated when make is selected)
- Year range: min/max selects (1990–current year)
- Price range: min/max number inputs with $ formatting
- Max mileage: select (any / 50k / 75k / 100k / 125k / 150k / 200k)
- ZIP code + radius select
- Transmission: Any / Automatic / Manual
- Condition: Any / Excellent / Good / Fair
- Sort by dropdown
- Search button (triggers POST /api/search)

### Listing Grid
- Responsive card grid (3 cols desktop, 2 tablet, 1 mobile)
- Each card shows: primary image, year/make/model, price, mileage, location, seller type badge, history badges
- Sort/filter bar above grid

### Listing Card
- Click opens detail drawer/modal (not a new page)
- Full image carousel
- Full description
- History section: recall count badges, complaint count, NICB flag
- "Get AI Analysis" button → triggers POST /api/analyze, shows streaming panel

### History Badges (on card)
- Green shield: "0 Recalls" 
- Yellow warning: "2 Recalls" (open recalls in orange)
- Red alert: "NICB Flag" (stolen/salvage)
- Gray: "No VIN" (history unavailable)

### AI Analysis Panel
Streamed in real time. Sections rendered as they arrive:
1. Buy Rating badge (BUY=green / CAUTION=yellow / AVOID=red) + score (X/10) + price assessment chip
2. Reliability Summary
3. Known Pain Points (bulleted)
4. Maintenance at {mileage} (bulleted)
5. Recall Warnings (if any, red-highlighted)
6. Inspection Checklist (checkboxes, user can check off)
7. Questions to Ask Seller (bulleted, click-to-copy)
8. Buy Rationale (paragraph)

---

## 11. Caching Strategy

SQLite database (`cache.db`):

| Table | Key | TTL |
|-------|-----|-----|
| search_results | hash(SearchParams) | 30 min |
| vin_history | vin | 24 hours |
| ai_analysis | listing_id + vin | 7 days |
| vin_decode | vin | permanent |

---

## 12. Environment Variables

```
# backend/.env
ANTHROPIC_API_KEY=sk-ant-...
FB_PROFILE_PATH=C:/Users/.../fb-playwright-profile   # persistent Chromium profile
FB_HEADLESS=true              # set false for debugging scraper
CACHE_DB_PATH=./cache.db
LOG_LEVEL=INFO
```

---

## 13. Implementation Phases

### Phase 1 — Backend skeleton + NHTSA integration (no scraping)
- FastAPI app with all endpoints stubbed
- NHTSA VIN decode, recalls, complaints working
- SQLite cache layer
- Pydantic models validated

### Phase 2 — Playwright scraper
- FB Marketplace search scrape
- Listing detail scrape
- VIN extraction regex
- Integration with Phase 1 history fetch

### Phase 3 — Claude AI analysis
- Prompt builder
- Streaming SSE endpoint
- Frontend streaming consumer

### Phase 4 — Frontend
- SearchForm
- ListingGrid + ListingCard
- HistoryBadges
- AiAnalysisPanel with streaming

### Phase 5 — Polish
- Loading skeletons
- Error states
- Mobile responsive
- Rate limiting / retry logic

---

## 14. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | Python 3.11 + FastAPI | Async-native, Playwright integrates cleanly |
| Scraping | Playwright (async) | Handles FB's JS-heavy pages |
| AI | Anthropic SDK (Python) | Claude sonnet-4-6 streaming |
| Cache | SQLite via aiosqlite | Zero-dep persistence |
| Frontend | React 18 + Vite + TypeScript | Fast dev, consistent with other projects |
| Styling | Tailwind CSS v3 | Utility-first, fast to build |
| HTTP | Axios (frontend) + httpx (backend) | Async HTTP |

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| FB blocks scraper | Persistent profile (user stays logged in), random delays, real UA |
| FB changes DOM | CSS selectors abstracted in `scraper.py`; easy to update |
| NICB VINCheck blocks automated requests | Falls back gracefully to `null` with user warning |
| VIN not in listing | History section shows "VIN not found — manual lookup recommended" |
| Claude rate limits | Exponential backoff; analysis is user-triggered not bulk |
