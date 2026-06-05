"""
Feature 1: Market price estimation and Feature 3: State title check links.
Feature 4: Affiliate link generation.
Feature 5: Pre-computed deal score.
"""
import re
from datetime import datetime, timezone
from typing import Optional

# ---------------------------------------------------------------------------
# Feature 3: State DMV title check URLs (all 50 states)
# ---------------------------------------------------------------------------
_STATE_DMV_URLS: dict[str, str] = {
    "AL": "https://www.mvtrip.alabama.gov/",
    "AK": "https://www.dmv.alaska.gov/",
    "AZ": "https://www.azdot.gov/motor-vehicles",
    "AR": "https://www.dfa.arkansas.gov/office/motor-vehicle/",
    "CA": "https://www.dmv.ca.gov/portal/vehicle-registration/",
    "CO": "https://dmv.colorado.gov/",
    "CT": "https://portal.ct.gov/DMV",
    "DE": "https://www.dmv.de.gov/",
    "FL": "https://www.flhsmv.gov/auto-safety/vehicle-tags-registration-titles/",
    "GA": "https://mvd.dor.ga.gov/",
    "HI": "https://hidot.hawaii.gov/highways/mvmt/",
    "ID": "https://itd.idaho.gov/dmv/",
    "IL": "https://www.ilsos.gov/departments/vehicles/home.html",
    "IN": "https://www.in.gov/bmv/",
    "IA": "https://iowadot.gov/mvd",
    "KS": "https://www.ksrevenue.gov/dovindex.html",
    "KY": "https://drive.ky.gov/",
    "LA": "https://www.expresslane.org/",
    "ME": "https://www.maine.gov/sos/bmv/",
    "MD": "https://mva.maryland.gov/",
    "MA": "https://www.mass.gov/orgs/registry-of-motor-vehicles",
    "MI": "https://www.michigan.gov/sos/",
    "MN": "https://dps.mn.gov/divisions/dvs/",
    "MS": "https://www.dps.state.ms.us/",
    "MO": "https://dor.mo.gov/motor-vehicle/",
    "MT": "https://dojmt.gov/driving/",
    "NE": "https://dmv.nebraska.gov/",
    "NV": "https://dmv.nv.gov/",
    "NH": "https://www.dmv.nh.gov/",
    "NJ": "https://www.njmvc.gov/",
    "NM": "https://www.mvd.newmexico.gov/",
    "NY": "https://dmv.ny.gov/",
    "NC": "https://www.ncdot.gov/dmv/",
    "ND": "https://www.dot.nd.gov/dotnet2/motor_vehicle_home.aspx",
    "OH": "https://www.bmv.ohio.gov/",
    "OK": "https://www.ok.gov/tax/Vehicles/",
    "OR": "https://www.oregon.gov/odot/dmv/",
    "PA": "https://www.penndot.pa.gov/",
    "RI": "https://dmv.ri.gov/",
    "SC": "https://www.scdmvonline.com/",
    "SD": "https://dor.sd.gov/individuals/motor-vehicle/",
    "TN": "https://www.tn.gov/revenue/title-and-registration.html",
    "TX": "https://www.txdmv.gov/",
    "UT": "https://dmv.utah.gov/",
    "VT": "https://dmv.vermont.gov/",
    "VA": "https://www.dmv.virginia.gov/",
    "WA": "https://www.dol.wa.gov/",
    "WV": "https://transportation.wv.gov/dmv/",
    "WI": "https://wisconsindot.gov/Pages/dmv/",
    "WY": "https://dot.state.wy.us/",
    "DC": "https://dmv.dc.gov/",
    "PR": "https://www.dtop.gov.pr/",
    "VI": "https://ltg.gov.vi/departments/bureau-of-motor-vehicles/",
    "GU": "https://www.dmvguam.com/",
}

_STATE_RE = re.compile(r'\b([A-Z]{2})\s*$')


def get_title_check_url(location: str) -> Optional[str]:
    """Parse state abbreviation from location string and return DMV URL."""
    if not location:
        return None
    # Try "City, ST" pattern
    m = re.search(r',\s*([A-Z]{2})\b', location.strip().upper())
    if m:
        state = m.group(1)
        return _STATE_DMV_URLS.get(state)
    return None


# ---------------------------------------------------------------------------
# Feature 4: Affiliate link generation
# ---------------------------------------------------------------------------
def get_carfax_url(vin: str) -> str:
    """Build Carfax deep link for VIN report."""
    return f"https://www.carfax.com/VehicleHistory/p/Report_.cfx?partner=DVW_1&vin={vin}"


def get_autocheck_url(vin: str) -> str:
    """Build AutoCheck deep link for VIN report."""
    return f"https://www.autocheck.com/vehiclehistory/autocheck/en/vehiclehistory?vin={vin}"


# ---------------------------------------------------------------------------
# Feature 1: Market price estimation using listing data
# ---------------------------------------------------------------------------
def estimate_market_price(
    make: Optional[str],
    model: Optional[str],
    year: Optional[int],
    listings: list,  # list[Listing]
) -> Optional[int]:
    """
    Estimate average private-party price for a year/make/model from current search results.
    Returns None if not enough data.
    """
    if not (make and model and year):
        return None

    prices = []
    for l in listings:
        if (
            l.price
            and l.year == year
            and (l.make or "").lower() == make.lower()
            and (l.model or "").lower() == model.lower()
        ):
            prices.append(l.price)

    if len(prices) < 2:
        return None

    # Use median to reduce outlier skew
    prices_sorted = sorted(prices)
    mid = len(prices_sorted) // 2
    if len(prices_sorted) % 2 == 0:
        median = (prices_sorted[mid - 1] + prices_sorted[mid]) // 2
    else:
        median = prices_sorted[mid]
    return median


def compute_price_delta_pct(price: Optional[int], market_estimate: Optional[int]) -> Optional[float]:
    """Compute how far above/below market the listing price is."""
    if price is None or market_estimate is None or market_estimate == 0:
        return None
    return round((price - market_estimate) / market_estimate * 100, 1)


# ---------------------------------------------------------------------------
# Feature 5: Pre-computed deal score (server-side only)
# ---------------------------------------------------------------------------
def compute_quick_score(listing) -> int:  # listing: Listing
    """
    Compute a 0-100 deal score without calling Claude.

    Factors:
    - Recall count: -3 per recall (capped at -15)
    - Complaint count: -1 per 10 complaints (capped at -10)
    - NICB stolen: -40
    - NICB salvage: -25
    - Price vs market: up to +20 if underpriced, -20 if overpriced
    - Mileage: 0-20 points (lower = better)
    - Seller type: +3 for private (often better pricing)
    """
    score = 50  # baseline

    h = listing.history

    # Recall penalty
    if h:
        recall_pen = min(h.recall_count * 3, 15)
        score -= recall_pen

        # Complaint penalty
        complaint_pen = min(h.complaint_count // 10, 10)
        score -= complaint_pen

        # NICB flags — heavy penalty
        if h.nicb_stolen:
            score -= 40
        elif h.nicb_salvage:
            score -= 25

    # Price vs market
    if listing.price_delta_pct is not None:
        delta = listing.price_delta_pct
        if delta < -15:
            score += 20
        elif delta < -5:
            score += 12
        elif delta < 5:
            score += 5
        elif delta < 15:
            score -= 8
        else:
            score -= 20

    # Mileage score (0 mi = +20, 200k mi = 0)
    if listing.mileage is not None:
        mileage_pts = max(0, int(20 - (listing.mileage / 200_000) * 20))
        score += mileage_pts

    # Seller type bonus
    if listing.seller_type == "private":
        score += 3

    return max(0, min(100, score))
