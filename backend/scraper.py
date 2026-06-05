"""
Playwright-based Facebook Marketplace vehicle scraper.

Prerequisites:
  - User must log into Facebook once using the persistent profile (set FB_PROFILE_PATH env).
  - `playwright install chromium`
"""
import asyncio
import logging
import os
import random
import re
from datetime import datetime, timezone
from ipaddress import ip_address, ip_network
from typing import Optional
from urllib.parse import urlencode, urlparse

from playwright.async_api import async_playwright, Page, BrowserContext

from models import Listing, SearchParams
from vin_decoder import extract_vin

logger = logging.getLogger(__name__)

FB_PROFILE_PATH = os.getenv("FB_PROFILE_PATH", "./fb-profile")
HEADLESS = os.getenv("FB_HEADLESS", "true").lower() == "true"

_ALLOWED_FB_HOSTS = {"www.facebook.com", "facebook.com"}
_FB_MARKETPLACE_BASE = "https://www.facebook.com/marketplace/category/vehicles"

TRANSMISSION_MAP = {
    "automatic": "automatic",
    "manual": "manual",
    "any": None,
}

# Feature 11: Proxy rotation
_PRIVATE_NETWORKS = [
    ip_network("10.0.0.0/8"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
    ip_network("127.0.0.0/8"),
    ip_network("::1/128"),
    ip_network("fc00::/7"),
]


def _load_proxies() -> list[str]:
    """Load and validate proxy list from env. Never log credentials."""
    raw = os.getenv("PROXY_LIST", "")
    if not raw.strip():
        return []
    proxies = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            parsed = urlparse(entry)
            if parsed.scheme not in ("http", "https"):
                logger.warning("Proxy rejected: invalid scheme (must be http/https)")
                continue
            # Resolve hostname — block private IPs
            host = parsed.hostname or ""
            try:
                addr = ip_address(host)
                for net in _PRIVATE_NETWORKS:
                    if addr in net:
                        logger.warning("Proxy rejected: private IP range blocked")
                        break
                else:
                    proxies.append(entry)
            except ValueError:
                # Not an IP address — hostname, allow it (can't resolve at config time)
                if host and host != "localhost":
                    proxies.append(entry)
                else:
                    logger.warning("Proxy rejected: localhost not allowed")
        except Exception:
            logger.warning("Proxy entry could not be parsed, skipping")
    return proxies


_PROXIES = _load_proxies()


def _pick_proxy() -> Optional[str]:
    """Randomly select a proxy if any are configured."""
    if not _PROXIES:
        return None
    return random.choice(_PROXIES)


def _build_marketplace_url(params: SearchParams, zip_code: Optional[str] = None) -> str:
    """Build FB Marketplace URL with properly URL-encoded query params."""
    query: dict[str, str] = {}

    if params.price_min:
        query["minPrice"] = str(params.price_min)
    if params.price_max:
        query["maxPrice"] = str(params.price_max)
    if params.year_min:
        query["minYear"] = str(params.year_min)
    if params.year_max:
        query["maxYear"] = str(params.year_max)
    if params.mileage_max:
        query["maxMileage"] = str(params.mileage_max)
    # make/model URL-encoded via urlencode — no injection possible
    if params.make:
        query["make"] = params.make.upper()
    if params.model:
        query["model"] = params.model
    if params.transmission and params.transmission != "any":
        t = TRANSMISSION_MAP.get(params.transmission)
        if t:
            query["transmission"] = t
    query["radius"] = str(params.radius_miles)

    qs = urlencode(query)
    return f"{_FB_MARKETPLACE_BASE}?{qs}" if qs else _FB_MARKETPLACE_BASE


def _assert_fb_host(url: str) -> None:
    """Prevent the browser from navigating to non-FB URLs."""
    host = urlparse(url).netloc.lower()
    if host not in _ALLOWED_FB_HOSTS:
        raise ValueError(f"Refusing navigation to non-Facebook host: {host!r}")


def _parse_price(text: str) -> Optional[int]:
    cleaned = re.sub(r"[^\d]", "", text)
    if not cleaned:
        return None
    val = int(cleaned)
    return val if val <= 10_000_000 else None


def _parse_mileage(text: str) -> Optional[int]:
    match = re.search(r"([\d,]+)\s*[Kk]?\s*(?:miles?|mi)", text)
    if not match:
        return None
    raw = match.group(1).replace(",", "")
    val = int(raw)
    if "K" in text or "k" in text:
        val *= 1000
    return val if val <= 2_000_000 else None


def _parse_year(text: str) -> Optional[int]:
    match = re.search(r'\b(19[0-9]{2}|20[0-2][0-9])\b', text)
    return int(match.group(1)) if match else None


async def _random_delay():
    await asyncio.sleep(random.uniform(1.0, 3.0))


async def _scrape_listing_detail(page: Page, url: str, listing_id: str) -> Listing:
    """Visit a single listing page and extract full details."""
    _assert_fb_host(url)   # guard: only FB URLs
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await _random_delay()

    listing = Listing(listing_id=listing_id, url=url, title="")

    try:
        title_el = await page.query_selector('h1[class*="x1heor9g"], span[class*="x193iq5w"]')
        if title_el:
            listing.title = (await title_el.inner_text()).strip()[:300]

        price_el = await page.query_selector('div[class*="x1anpbxc"] span')
        if price_el:
            listing.price = _parse_price(await price_el.inner_text())

        listing.year = _parse_year(listing.title)

        desc_el = await page.query_selector('div[data-ad-comet-preview="message"]')
        if desc_el:
            raw_desc = (await desc_el.inner_text()).strip()
            # Truncate description at model limit
            listing.description = raw_desc[:10_000]
            listing.vin = extract_vin(listing.description)
            mileage = _parse_mileage(listing.description)
            if mileage:
                listing.mileage = mileage

        loc_els = await page.query_selector_all('span[class*="x1lliihq"]')
        for el in loc_els:
            text = (await el.inner_text()).strip()
            if re.search(r',\s*[A-Z]{2}', text):
                listing.location = text[:200]
                break

        seller_el = await page.query_selector('a[href*="/marketplace/profile/"]')
        if seller_el:
            listing.seller_name = (await seller_el.inner_text()).strip()[:200]

        img_els = await page.query_selector_all('img[class*="x1lliihq"][src*="scontent"]')
        listing.images = [
            src for el in img_els[:20]
            if (src := await el.get_attribute("src"))
            and src.startswith("https://")
            and ("scontent" in src or "fbcdn" in src)
        ][:10]

        # Infer seller type from page signals — use page.title() not full HTML
        page_title = (await page.title()).lower()
        seller_lower = listing.seller_name.lower()
        if "dealer" in page_title or "dealer" in seller_lower or "auto" in seller_lower:
            listing.seller_type = "dealer"
        else:
            listing.seller_type = "private"

    except Exception as e:
        logger.warning("Error scraping listing %s: %s", listing_id, type(e).__name__)

    # Feature 12: stamp scraped_at
    listing.scraped_at = datetime.now(timezone.utc).isoformat()
    return listing


async def _scrape_search_results(context: BrowserContext, url: str, max_results: int = 40) -> list[dict]:
    _assert_fb_host(url)
    page = await context.new_page()
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await _random_delay()

        for _ in range(5):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1.5)

        cards = []
        card_els = await page.query_selector_all('div[class*="x9f619"] a[href*="/marketplace/item/"]')
        seen_ids: set[str] = set()

        for el in card_els[:max_results]:
            try:
                href = await el.get_attribute("href")
                if not href:
                    continue
                id_match = re.search(r'/item/(\d+)', href)
                if not id_match:
                    continue
                listing_id = id_match.group(1)
                if len(listing_id) > 50 or listing_id in seen_ids:
                    continue
                seen_ids.add(listing_id)

                card_text = (await el.inner_text())[:500]
                # Only follow relative FB paths
                if href.startswith("/"):
                    full_url = f"https://www.facebook.com{href}"
                elif href.startswith("https://www.facebook.com/"):
                    full_url = href
                else:
                    continue  # skip unexpected URLs

                cards.append({"id": listing_id, "url": full_url, "card_text": card_text})
            except Exception:
                continue

        return cards
    finally:
        await page.close()


def _deduplicate_listings(listings: list[Listing]) -> list[Listing]:
    """
    Feature 8: Deduplicate by VIN (keep lower price) or by (year, make, model, price ±$500).
    """
    # First pass: deduplicate by VIN
    vin_map: dict[str, Listing] = {}
    no_vin: list[Listing] = []

    for listing in listings:
        if listing.vin:
            existing = vin_map.get(listing.vin)
            if existing is None:
                vin_map[listing.vin] = listing
            else:
                # Keep lower-priced entry
                ep = existing.price or 999_999_999
                lp = listing.price or 999_999_999
                if lp < ep:
                    vin_map[listing.vin] = listing
        else:
            no_vin.append(listing)

    # Second pass: deduplicate no-VIN listings by (year, make, model, price ±$500)
    deduped_no_vin: list[Listing] = []
    for listing in no_vin:
        duplicate = False
        for existing in deduped_no_vin:
            if (
                listing.year == existing.year
                and (listing.make or "").lower() == (existing.make or "").lower()
                and (listing.model or "").lower() == (existing.model or "").lower()
                and listing.price is not None
                and existing.price is not None
                and abs(listing.price - existing.price) <= 500
            ):
                duplicate = True
                break
        if not duplicate:
            deduped_no_vin.append(listing)

    return list(vin_map.values()) + deduped_no_vin


async def _scrape_for_zip(params: SearchParams, zip_code: str) -> list[Listing]:
    """Scrape for a single ZIP code."""
    url = _build_marketplace_url(params, zip_code)
    proxy = _pick_proxy()

    launch_kwargs: dict = {
        "user_data_dir": FB_PROFILE_PATH,
        "headless": HEADLESS,
        "viewport": {"width": 1280, "height": 900},
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    }
    if proxy:
        # Never log the proxy URL (may contain credentials)
        logger.info("Using proxy for ZIP %s (credentials redacted)", zip_code)
        launch_kwargs["proxy"] = {"server": proxy}

    listings: list[Listing] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch_persistent_context(**launch_kwargs)
        try:
            cards = await _scrape_search_results(browser, url)
            logger.info("Found %d listing cards for ZIP %s", len(cards), zip_code)

            sem = asyncio.Semaphore(3)

            async def scrape_one(card: dict) -> Optional[Listing]:
                async with sem:
                    page = await browser.new_page()
                    try:
                        listing = await _scrape_listing_detail(page, card["url"], card["id"])
                        if not listing.price:
                            listing.price = _parse_price(card["card_text"])
                        if not listing.mileage:
                            listing.mileage = _parse_mileage(card["card_text"])
                        if not listing.year:
                            listing.year = _parse_year(card["card_text"])
                        if not listing.title:
                            listing.title = card["card_text"].split("\n")[0][:100]
                        await _random_delay()
                        return listing
                    except ValueError as e:
                        logger.warning("Skipping unsafe URL for card %s: %s", card["id"], e)
                        return None
                    except Exception as e:
                        logger.warning("Failed to scrape %s: %s", card["id"], type(e).__name__)
                        return None
                    finally:
                        await page.close()

            tasks = [scrape_one(card) for card in cards]
            results = await asyncio.gather(*tasks)
            listings = [r for r in results if r is not None]
        finally:
            await browser.close()

    return listings


async def scrape(params: SearchParams) -> list[Listing]:
    logger.info(
        "Scraping marketplace: make=%s model=%s year=%s-%s",
        params.make or "any",
        params.model or "any",
        params.year_min or "any",
        params.year_max or "any",
    )

    # Feature 9: multi-ZIP search with Semaphore(2) and total cap 100
    zip_codes = params.zip_codes if params.zip_codes else [params.zip_code]
    # Enforce max 5 ZIPs (already validated in model, but belt-and-suspenders)
    zip_codes = zip_codes[:5]

    all_listings: list[Listing] = []

    if len(zip_codes) == 1:
        # Single ZIP: use existing flow
        listings = await _scrape_for_zip(params, zip_codes[0])
        all_listings = listings
    else:
        # Multi-ZIP: concurrent with Semaphore(2)
        sem = asyncio.Semaphore(2)

        async def scrape_zip(z: str) -> list[Listing]:
            async with sem:
                return await _scrape_for_zip(params, z)

        results = await asyncio.gather(*[scrape_zip(z) for z in zip_codes])
        for r in results:
            all_listings.extend(r)

    # Feature 8: deduplicate
    all_listings = _deduplicate_listings(all_listings)

    # Total cap: 100 listings
    all_listings = all_listings[:100]

    all_listings = _apply_filters(all_listings, params)
    all_listings = _sort_listings(all_listings, params.sort_by)
    return all_listings


def _apply_filters(listings: list[Listing], params: SearchParams) -> list[Listing]:
    out = []
    for l in listings:
        if params.price_min and l.price and l.price < params.price_min:
            continue
        if params.price_max and l.price and l.price > params.price_max:
            continue
        if params.mileage_max and l.mileage and l.mileage > params.mileage_max:
            continue
        if params.year_min and l.year and l.year < params.year_min:
            continue
        if params.year_max and l.year and l.year > params.year_max:
            continue
        out.append(l)
    return out


def _sort_listings(listings: list[Listing], sort_by: str) -> list[Listing]:
    if sort_by == "price_asc":
        return sorted(listings, key=lambda l: l.price or 999_999)
    if sort_by == "price_desc":
        return sorted(listings, key=lambda l: l.price or 0, reverse=True)
    if sort_by == "mileage_asc":
        return sorted(listings, key=lambda l: l.mileage or 999_999)
    return listings
