"""NHTSA vPIC VIN decode + recalls + complaints + NICB check."""
import asyncio
import re
from datetime import datetime, timezone
from typing import Optional

import httpx

import cache
from models import Complaint, DecodedVIN, Recall, VehicleHistory
from security import validate_vin

import logging
logger = logging.getLogger(__name__)

# VIN regex — used for extraction from free text only; strict validation via validate_vin()
_VIN_EXTRACT_RE = re.compile(r'\b[A-HJ-NPR-Z0-9]{17}\b')

# NHTSA base URLs — never built from user input
_NHTSA_VPIC_BASE = "https://vpic.nhtsa.dot.gov"
_NHTSA_API_BASE = "https://api.nhtsa.gov"

# Allowed NHTSA hostnames — SSRF guard
_ALLOWED_NHTSA_HOSTS = {"vpic.nhtsa.dot.gov", "api.nhtsa.gov"}


def _assert_nhtsa_host(url: str) -> None:
    """Raise if the resolved URL is not a known NHTSA host."""
    from urllib.parse import urlparse
    host = urlparse(url).netloc.lower()
    if host not in _ALLOWED_NHTSA_HOSTS:
        raise ValueError(f"Refusing request to unexpected host: {host!r}")


def extract_vin(text: str) -> Optional[str]:
    """Pull a 17-char VIN from arbitrary text."""
    for m in _VIN_EXTRACT_RE.findall(text.upper()):
        if len(set(m)) > 3:  # discard low-entropy false positives
            try:
                return validate_vin(m)
            except ValueError:
                continue
    return None


def _pick(results: list[dict], variable: str) -> Optional[str]:
    for r in results:
        if r.get("Variable") == variable:
            v = r.get("Value")
            return v if v and v not in ("Not Applicable", "null", "") else None
    return None


async def decode_vin(vin: str) -> Optional[DecodedVIN]:
    vin = validate_vin(vin)  # raises ValueError if invalid

    cached = await cache.get_vin_decode(vin)
    if cached:
        try:
            return DecodedVIN(**cached)
        except Exception:
            logger.warning("Corrupt VIN decode cache for %s — refreshing", vin)

    # Build URL using httpx params to prevent injection
    url = f"{_NHTSA_VPIC_BASE}/api/vehicles/decodevin/{vin}"
    _assert_nhtsa_host(url)

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            resp = await client.get(url, params={"format": "json"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("VIN decode failed for %s: %s", vin, type(e).__name__)
        return None

    results = data.get("Results", [])
    year_str = _pick(results, "Model Year")
    make = _pick(results, "Make")
    model = _pick(results, "Model")

    if not (year_str and make and model):
        return None

    try:
        year = int(year_str)
    except ValueError:
        return None

    try:
        decoded = DecodedVIN(
            vin=vin,
            make=make[:100].title(),
            model=model[:100].title(),
            year=year,
            trim=(_pick(results, "Trim") or "")[:100] or None,
            engine=(_pick(results, "Displacement (L)") or "")[:50] or None,
            transmission=(_pick(results, "Transmission Style") or "")[:100] or None,
            drive_type=(_pick(results, "Drive Type") or "")[:50] or None,
            body_style=(_pick(results, "Body Class") or "")[:100] or None,
            plant_country=(_pick(results, "Plant Country") or "")[:100] or None,
        )
    except Exception as e:
        logger.warning("DecodedVIN validation error for %s: %s", vin, e)
        return None

    await cache.set_vin_decode(vin, decoded.model_dump())
    return decoded


async def fetch_recalls(make: str, model: str, year: int) -> list[Recall]:
    url = f"{_NHTSA_API_BASE}/recalls/recallsByVehicle"
    _assert_nhtsa_host(url)

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            resp = await client.get(url, params={"make": make, "model": model, "modelYear": year})
            resp.raise_for_status()
            items = resp.json().get("results", [])
    except Exception as e:
        logger.warning("Recalls fetch failed (%s/%s/%s): %s", make, model, year, type(e).__name__)
        return []

    recalls = []
    for item in items[:100]:
        try:
            recalls.append(Recall(
                recall_id=(item.get("NHTSACampaignNumber") or "")[:50],
                component=(item.get("Component") or "")[:300],
                summary=(item.get("Summary") or "")[:2000],
                consequence=(item.get("Consequence") or "")[:2000],
                remedy=(item.get("Remedy") or "")[:2000],
                date=(item.get("ReportReceivedDate") or "")[:50],
            ))
        except Exception:
            continue
    return recalls


async def fetch_complaints(make: str, model: str, year: int) -> list[Complaint]:
    url = f"{_NHTSA_API_BASE}/complaints/complaintsByVehicle"
    _assert_nhtsa_host(url)

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            resp = await client.get(url, params={"make": make, "model": model, "modelYear": year})
            resp.raise_for_status()
            items = resp.json().get("results", [])
    except Exception as e:
        logger.warning("Complaints fetch failed (%s/%s/%s): %s", make, model, year, type(e).__name__)
        return []

    complaints = []
    for item in items[:50]:
        try:
            complaints.append(Complaint(
                odometer=item.get("mileage"),
                incident_date=(item.get("dateOfIncident") or "")[:50] or None,
                component=(item.get("components") or "")[:300],
                summary=(item.get("summary") or "")[:2000],
            ))
        except Exception:
            continue
    return complaints


async def get_vehicle_history(vin: str, decoded: DecodedVIN) -> VehicleHistory:
    vin = validate_vin(vin)

    cached = await cache.get_vin_history(vin)
    if cached:
        try:
            return VehicleHistory(**cached)
        except Exception:
            logger.warning("Corrupt history cache for %s — refreshing", vin)

    recalls_task = asyncio.create_task(
        fetch_recalls(decoded.make, decoded.model, decoded.year)
    )
    complaints_task = asyncio.create_task(
        fetch_complaints(decoded.make, decoded.model, decoded.year)
    )
    recalls = await recalls_task
    complaints = await complaints_task

    # Feature 2: NICB VINCheck integration — validate VIN, fall back gracefully
    nicb_stolen: Optional[bool] = None
    nicb_salvage: Optional[bool] = None
    try:
        from nicb import check_nicb
        nicb_result = await check_nicb(vin)
        if nicb_result is not None:
            nicb_stolen = nicb_result.get("stolen")
            nicb_salvage = nicb_result.get("salvage")
    except Exception as e:
        logger.warning("NICB integration error for %s: %s", vin, type(e).__name__)

    history = VehicleHistory(
        vin=vin,
        recall_count=len(recalls),
        open_recall_count=len(recalls),
        recalls=recalls,
        complaint_count=len(complaints),
        complaints=complaints,
        nicb_stolen=nicb_stolen,
        nicb_salvage=nicb_salvage,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )
    await cache.set_vin_history(vin, history.model_dump())
    return history
