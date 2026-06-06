FROM python:3.11-slim

# System deps for Playwright/Chromium
RUN apt-get update && apt-get install -y \
    wget curl ca-certificates \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libx11-6 libx11-xcb1 libxcb1 \
    libxext6 libxss1 fonts-liberation libappindicator3-1 \
    xdg-utils && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (Chromium only)
RUN playwright install chromium && playwright install-deps chromium

COPY . .

# Runtime dirs — will be overridden by Fly volume mount
RUN mkdir -p /data/fb-profile

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
