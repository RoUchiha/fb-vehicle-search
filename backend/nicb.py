"""
NICB VINCheck automation via Playwright.

Personal-use scraper. Validates the VIN before any navigation.
Only ever navigates to nicb.org. Gracefully returns None if blocked/timeout.
"""
import logging
import re
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_VIN_RE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
_ALLOWED_NICB_HOST = "www.nicb.org"
_NICB_VINCHECK_URL = "https://www.nicb.org/vincheck"


def _validate_vin_for_nicb(vin: str) -> str:
    """Raise ValueError if VIN is not safe for navigation."""
    vin = vin.upper().strip()
    if not _VIN_RE.match(vin):
        raise ValueError(f"Invalid VIN for NICB check: {vin!r}")
    return vin


def _assert_nicb_host(url: str) -> None:
    """Raise if URL is not on the allowed NICB host."""
    host = urlparse(url).netloc.lower()
    if host != _ALLOWED_NICB_HOST:
        raise ValueError(f"Refusing navigation to non-NICB host: {host!r}")


async def check_nicb(vin: str) -> Optional[dict]:
    """
    Submit a VIN to NICB VINCheck and return stolen/salvage status.

    Returns:
        {"stolen": bool, "salvage": bool} on success
        None if check is unavailable or blocked
    """
    try:
        vin = _validate_vin_for_nicb(vin)
    except ValueError as e:
        logger.warning("NICB VIN validation failed: %s", e)
        return None

    # Verify URLs before use
    _assert_nicb_host(_NICB_VINCHECK_URL)

    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, timeout=15_000)
            try:
                context = await browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    )
                )
                page = await context.new_page()

                # Navigate to NICB VINCheck
                await page.goto(_NICB_VINCHECK_URL, wait_until="domcontentloaded", timeout=15_000)

                # Fill in VIN field
                vin_input = await page.query_selector('input[name="vin"], input[id*="vin"], input[placeholder*="VIN"]')
                if not vin_input:
                    logger.warning("NICB: VIN input field not found")
                    return None

                await vin_input.fill(vin)

                # Submit form
                submit_btn = await page.query_selector('button[type="submit"], input[type="submit"]')
                if not submit_btn:
                    logger.warning("NICB: submit button not found")
                    return None

                await submit_btn.click()
                await page.wait_for_load_state("networkidle", timeout=10_000)

                # Parse result text
                body_text = (await page.inner_text("body")).lower()

                stolen = "stolen" in body_text and ("reported" in body_text or "flag" in body_text)
                salvage = "salvage" in body_text and ("title" in body_text or "reported" in body_text)

                logger.info("NICB check for %s: stolen=%s salvage=%s", vin, stolen, salvage)
                return {"stolen": stolen, "salvage": salvage}

            finally:
                await browser.close()

    except Exception as e:
        logger.warning("NICB check failed for %s: %s", vin, type(e).__name__)
        return None
