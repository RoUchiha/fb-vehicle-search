# Deployment Guide — Full Live Demo

This gets the app fully live: real FB Marketplace scraping, real NHTSA/NICB vetting, real Claude AI analysis.

---

## Architecture

```
Vercel (frontend)  ──── HTTPS ────►  Fly.io (backend FastAPI)
                                           │
                                     /data volume (3GB)
                                       ├── fb-profile/   ← Facebook session
                                       └── cache.db      ← SQLite cache
```

---

## Step 1 — Install flyctl

```bash
# macOS/Linux:
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell):
iwr https://fly.io/install.ps1 -useb | iex

fly auth login    # opens browser → sign up free at fly.io
```

---

## Step 2 — Deploy the backend (one command)

```bash
# From the repo root:
bash fly-setup.sh
```

This script will:
1. Create the Fly app `fb-vehicle-search-api`
2. Create a 3GB persistent volume for the FB profile + SQLite cache
3. Ask you for your `ANTHROPIC_API_KEY` and generate a random `API_KEY`
4. Set all secrets on Fly
5. Build and deploy the Docker container

At the end it prints your backend URL: `https://fb-vehicle-search-api.fly.dev`

---

## Step 3 — Log into Facebook (one-time, ~5 minutes)

The scraper needs a real logged-in Facebook session. The easiest way is to do this **locally** and then upload the profile folder to the Fly volume.

### Option A — Local login then upload (recommended)

```bash
# 1. Run the backend locally with visible browser:
cd backend
cp ../.env.example .env
# Set FB_HEADLESS=false in .env, fill in ANTHROPIC_API_KEY and API_KEY

pip install -r requirements.txt
playwright install chromium
uvicorn main:app --reload    # starts server

# 2. In a new terminal, trigger a search (any search) to launch the browser:
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"make":"Toyota","model":"","zip_code":"10001","radius_miles":25,"transmission":"any","condition":"any","sort_by":"relevance"}'

# 3. A Chrome window opens → log into Facebook → close the browser

# 4. Upload the saved profile to Fly:
fly sftp shell --app fb-vehicle-search-api
# Inside sftp shell:
put -r backend/fb-profile /data/fb-profile
exit

# 5. Restart the app:
fly apps restart fb-vehicle-search-api
```

### Option B — Direct SSH login (Linux/macOS only, requires Xvfb)

```bash
fly ssh console --app fb-vehicle-search-api

# Inside container:
apt-get install -y xvfb
Xvfb :99 -screen 0 1280x720x24 &
export DISPLAY=:99
python3 /app/fb_login_helper.py    # created by fly-setup.sh
```

---

## Step 4 — Connect the frontend on Vercel

1. Open your Vercel project → **Settings** → **Environment Variables**
2. Add / update:

| Variable | Value |
|----------|-------|
| `VITE_API_KEY` | The `API_KEY` value printed by `fly-setup.sh` |
| `VITE_DEMO_MODE` | `false` |
| `VITE_API_BASE_URL` | `https://fb-vehicle-search-api.fly.dev` |

3. **Redeploy** the Vercel project (Deployments → Redeploy latest)

> **Note:** The frontend's Vite dev proxy (`/api` → `localhost:8000`) works locally. For Vercel, we need to point at the Fly URL. This requires a small change to `vite.config.ts` — see below.

---

## Step 5 — Point frontend at Fly backend

In `frontend/src/api.ts`, the `BASE` constant currently uses `/api` (relative, proxied by Vite). For production, it needs the absolute Fly URL:

```typescript
// frontend/src/api.ts — change this line:
const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : "/api";
```

Add to `frontend/types.ts` env declaration (if using `vite-env.d.ts`):
```typescript
interface ImportMetaEnv {
  readonly VITE_API_KEY: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_API_BASE_URL?: string;   // add this
}
```

Then rebuild and redeploy:
```bash
cd frontend && npm run build
npx vercel deploy --yes --prod
```

---

## Verify it works

```bash
# Backend health:
curl https://fb-vehicle-search-api.fly.dev/api/health
# → {"status":"ok"}

# Test search (replace YOUR_API_KEY):
curl -X POST https://fb-vehicle-search-api.fly.dev/api/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"make":"Toyota","model":"Camry","zip_code":"10001","radius_miles":50,"transmission":"any","condition":"any","sort_by":"relevance"}'
# → {"job_id":"...","status":"pending"}  (then poll /api/jobs/{job_id})
```

---

## Railway (alternative to Fly.io)

If you prefer Railway:

1. Create a new Railway project at https://railway.app
2. Connect your GitHub repo (`RoUchiha/fb-vehicle-search`)
3. Set root directory to `fb-vehicle-search/backend` (or use the `railway.json` in repo root)
4. Add a **Volume** mounted at `/data`
5. Set environment variables:
   - `ANTHROPIC_API_KEY`
   - `API_KEY`
   - `ALLOWED_ORIGINS` (your Vercel URL)
   - `FB_PROFILE_PATH=/data/fb-profile`
   - `CACHE_DB_PATH=/data/cache.db`
   - `ENV=production`
   - `FB_HEADLESS=true`
6. Deploy → Railway builds from `backend/Dockerfile`
7. Follow the same FB login steps as Option A above (local login, upload via Railway's file manager)

---

## Cost estimate

| Service | Cost |
|---------|------|
| Fly.io shared-cpu-1x (512MB) | ~$3–5/mo |
| Fly.io volume (3GB) | ~$0.75/mo |
| Vercel (frontend) | Free |
| NHTSA/NICB APIs | Free |
| Anthropic Claude (per analysis) | ~$0.01–0.03/analysis |
| **Total** | **~$4–6/mo + Claude usage** |

---

## Keeping the Facebook session alive

Facebook sessions persist for months when used regularly. The scraper's usage alone is enough. If the session expires:
- You'll see login redirect errors in the Fly logs: `fly logs --app fb-vehicle-search-api`
- Repeat Step 3 (local login + upload)

To monitor logs continuously:
```bash
fly logs --app fb-vehicle-search-api
```
