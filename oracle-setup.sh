#!/usr/bin/env bash
# oracle-setup.sh — Install and run the FB Vehicle Search backend
# on Oracle Cloud Always Free (Ubuntu 22.04, ARM Ampere A1)
#
# Run this on the Oracle VM after SSH-ing in:
#   ssh ubuntu@<your-oracle-ip>
#   bash <(curl -fsSL https://raw.githubusercontent.com/RoUchiha/fb-vehicle-search/main/oracle-setup.sh)
#
# Oracle Always Free: 4 OCPU + 24GB RAM ARM VM — plenty for Playwright + FastAPI.
# Sign up free (credit card required for identity only, will NOT be charged):
#   https://www.oracle.com/cloud/free/

set -e
APP_DIR="/opt/fb-vehicle-search"
DATA_DIR="/data"
SERVICE="fb-vehicle-search"

echo "==> Updating system packages..."
sudo apt-get update -q && sudo apt-get upgrade -yq

echo "==> Installing Python 3.11 and system dependencies..."
sudo apt-get install -yq python3.11 python3.11-venv python3-pip git nginx certbot python3-certbot-nginx

echo "==> Installing Playwright system dependencies..."
sudo apt-get install -yq \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libx11-6 libx11-xcb1 libxcb1 \
    libxext6 fonts-liberation xdg-utils wget

echo "==> Creating data directory (persistent storage)..."
sudo mkdir -p "$DATA_DIR/fb-profile"
sudo chown -R ubuntu:ubuntu "$DATA_DIR"

echo "==> Cloning repository..."
sudo mkdir -p "$APP_DIR"
sudo chown ubuntu:ubuntu "$APP_DIR"
git clone https://github.com/RoUchiha/fb-vehicle-search.git "$APP_DIR" 2>/dev/null \
  || (cd "$APP_DIR" && git pull)

echo "==> Creating Python virtual environment..."
python3.11 -m venv "$APP_DIR/venv"
source "$APP_DIR/venv/bin/activate"

echo "==> Installing Python dependencies..."
cd "$APP_DIR/backend"
pip install --upgrade pip -q
pip install -r requirements.txt -q

echo "==> Installing Playwright Chromium..."
playwright install chromium

echo ""
echo "==> Configuring environment..."
if [ ! -f "$APP_DIR/backend/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/backend/.env"
    API_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    sed -i "s|API_KEY=change-me-generate-a-strong-random-secret|API_KEY=$API_KEY|g" "$APP_DIR/backend/.env"
    sed -i "s|FB_PROFILE_PATH=./fb-profile|FB_PROFILE_PATH=$DATA_DIR/fb-profile|g" "$APP_DIR/backend/.env"
    sed -i "s|CACHE_DB_PATH=./cache.db|CACHE_DB_PATH=$DATA_DIR/cache.db|g" "$APP_DIR/backend/.env"
    sed -i "s|ENV=dev|ENV=production|g" "$APP_DIR/backend/.env"
    echo ""
    echo "  *** Generated API_KEY: $API_KEY ***"
    echo "  Set this as VITE_API_KEY on Vercel."
    echo ""
    echo "  Now edit $APP_DIR/backend/.env to add your AI provider key:"
    echo "    nano $APP_DIR/backend/.env"
    echo ""
    echo "  Add ONE of:"
    echo "    GROQ_API_KEY=...     (free, https://console.groq.com)"
    echo "    GEMINI_API_KEY=...   (free, https://aistudio.google.com)"
    echo "    ANTHROPIC_API_KEY=.. (paid, https://console.anthropic.com)"
    echo ""
    read -rp "  Press Enter after editing .env to continue..."
fi

# Detect public IP for CORS
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")
echo "  Your server's public IP: $PUBLIC_IP"
read -rp "  Enter your Vercel frontend URL (e.g. https://frontend-kappa-three-65.vercel.app): " FRONTEND_URL
sed -i "s|ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000|ALLOWED_ORIGINS=$FRONTEND_URL,http://localhost:5173|g" "$APP_DIR/backend/.env"

echo "==> Creating systemd service..."
sudo tee /etc/systemd/system/${SERVICE}.service > /dev/null <<EOF
[Unit]
Description=FB Vehicle Search Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_DIR/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE"
sudo systemctl start "$SERVICE"

echo "==> Configuring nginx reverse proxy..."
PUBLIC_DOMAIN="$PUBLIC_IP"
read -rp "  Do you have a domain name pointed at this server? (leave blank to use IP only): " DOMAIN
if [ -n "$DOMAIN" ]; then
    PUBLIC_DOMAIN="$DOMAIN"
fi

sudo tee /etc/nginx/sites-available/${SERVICE} > /dev/null <<EOF
server {
    listen 80;
    server_name $PUBLIC_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # SSE support (streaming AI analysis)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/${SERVICE} /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

echo ""
echo "==> Opening firewall ports..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null 2>&1 || true

if [ -n "$DOMAIN" ]; then
    echo ""
    echo "==> Setting up free SSL certificate (Let's Encrypt)..."
    sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" || \
        echo "  SSL setup skipped — run: sudo certbot --nginx -d $DOMAIN"
fi

echo ""
echo "==> Setup complete!"
echo ""
echo "  Backend URL: http://$PUBLIC_DOMAIN"
echo "  Health check: curl http://$PUBLIC_DOMAIN/api/health"
echo ""
echo "======================================================="
echo "  NEXT: Log into Facebook (one-time)"
echo "======================================================="
echo ""
echo "  Run: cd $APP_DIR/backend && FB_HEADLESS=false python3 -c \""
echo "  import asyncio"
echo "  from playwright.async_api import async_playwright"
echo "  async def login():"
echo "      async with async_playwright() as p:"
echo "          ctx = await p.chromium.launch_persistent_context('$DATA_DIR/fb-profile', headless=False)"
echo "          page = ctx.pages[0] if ctx.pages else await ctx.new_page()"
echo "          await page.goto('https://www.facebook.com')"
echo "          input('Log in to Facebook, then press Enter...')"
echo "          await ctx.close()"
echo "  asyncio.run(login())\""
echo ""
echo "  NOTE: Oracle VMs have no display. Use option A from DEPLOY.md instead:"
echo "  log in locally, then scp fb-profile/ to $DATA_DIR/fb-profile"
echo ""
echo "  scp -r ./backend/fb-profile ubuntu@$PUBLIC_IP:$DATA_DIR/"
echo ""
echo "  Then restart: sudo systemctl restart $SERVICE"
echo ""
echo "  Finally, set on Vercel:"
echo "    VITE_API_BASE_URL=http://$PUBLIC_DOMAIN   (or https:// if SSL was set up)"
echo "    VITE_DEMO_MODE=false"
