#!/usr/bin/env bash
# fly-setup.sh — One-time Fly.io deploy for fb-vehicle-search backend
# Run this from the repo root after installing flyctl:
#   curl -L https://fly.io/install.sh | sh
#   fly auth login
#   bash fly-setup.sh

set -e
APP="fb-vehicle-search-api"
REGION="dfw"   # change to nearest: iad ord sea lax mia

echo "==> Creating Fly app (if it doesn't exist)..."
fly apps create "$APP" --org personal 2>/dev/null || echo "App already exists, continuing."

echo "==> Creating persistent volume (3GB for FB profile + SQLite cache)..."
fly volumes create vehicle_data \
  --app "$APP" \
  --region "$REGION" \
  --size 3 2>/dev/null || echo "Volume already exists, continuing."

echo ""
echo "==> Setting secrets..."
echo "    You'll be prompted for each value."
echo "    AI provider auto-detected: GROQ_API_KEY > GEMINI_API_KEY > ANTHROPIC_API_KEY"
echo ""

echo "  --- AI Provider (set ONE, leave others blank) ---"
read -rp "  GROQ_API_KEY    (FREE — https://console.groq.com): " GROQ_KEY
read -rp "  GEMINI_API_KEY  (FREE — https://aistudio.google.com): " GEMINI_KEY
read -rp "  ANTHROPIC_API_KEY (PAID — https://console.anthropic.com): " ANTHROPIC_KEY
echo ""
read -rp "  API_KEY (random secret — press Enter to generate): " API_KEY_VAL
if [ -z "$API_KEY_VAL" ]; then
  API_KEY_VAL=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
  echo "  Generated: $API_KEY_VAL"
  echo "  *** Save this — you'll need to set it as VITE_API_KEY on Vercel ***"
fi
read -rp "  ALLOWED_ORIGINS (your Vercel URL, e.g. https://frontend-kappa-three-65.vercel.app): " ORIGINS

fly secrets set \
  --app "$APP" \
  API_KEY="$API_KEY_VAL" \
  ALLOWED_ORIGINS="$ORIGINS" \
  FB_PROFILE_PATH="/data/fb-profile" \
  CACHE_DB_PATH="/data/cache.db" \
  ENV="production" \
  FB_HEADLESS="true" \
  ${GROQ_KEY:+GROQ_API_KEY="$GROQ_KEY"} \
  ${GEMINI_KEY:+GEMINI_API_KEY="$GEMINI_KEY"} \
  ${ANTHROPIC_KEY:+ANTHROPIC_API_KEY="$ANTHROPIC_KEY"}

echo ""
echo "==> Deploying backend..."
fly deploy --app "$APP" --config fly.toml

echo ""
echo "==> Deploy complete!"
FLY_URL="https://${APP}.fly.dev"
echo ""
echo "  Backend URL: $FLY_URL"
echo "  Health check: curl $FLY_URL/api/health"
echo ""
echo "======================================================="
echo "  NEXT STEP — Log into Facebook (one-time, ~2 minutes)"
echo "======================================================="
echo ""
echo "  The scraper needs a logged-in Facebook session."
echo "  Run this to open an SSH shell on the Fly machine:"
echo ""
echo "    fly ssh console --app $APP"
echo ""
echo "  Then inside the container run:"
echo ""
echo "    FB_HEADLESS=false python3 -c \""
echo "    import asyncio"
echo "    from playwright.async_api import async_playwright"
echo "    async def login():"
echo "        async with async_playwright() as p:"
echo "            ctx = await p.chromium.launch_persistent_context("
echo "                '/data/fb-profile', headless=False"
echo "            )"
echo "            page = ctx.pages[0] if ctx.pages else await ctx.new_page()"
echo "            await page.goto('https://www.facebook.com')"
echo "            input('Log into Facebook in the browser, then press Enter here...')"
echo "            await ctx.close()"
echo "    asyncio.run(login())"
echo "    \""
echo ""
echo "  NOTE: Fly SSH doesn't support a display — for the FB login step,"
echo "  it's easier to run the backend locally with FB_HEADLESS=false,"
echo "  log in, then copy the fb-profile/ folder to the Fly volume:"
echo ""
echo "    fly sftp shell --app $APP"
echo "    # Then: put -r ./backend/fb-profile /data/fb-profile"
echo ""
echo "  After FB login, restart the app:"
echo "    fly apps restart $APP"
echo ""
echo "  Then set on Vercel:"
echo "    VITE_API_KEY=$API_KEY_VAL"
echo "    VITE_DEMO_MODE=false"
echo "    (Set in your Vercel project → Settings → Environment Variables)"
echo ""
