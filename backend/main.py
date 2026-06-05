"""FastAPI backend for FB Vehicle Search."""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import cache
from models import SearchParams, SearchResponse, AnalysisRequest, Listing, JobResponse
from security import (
    verify_api_key,
    limit_request_body,
    validate_vin,
    sanitise_for_log,
)
from vin_decoder import decode_vin, get_vehicle_history, extract_vin
from ai_analysis import analyze_listing_stream
import jobs as job_queue

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowed CORS origins (tightened: exact list, no wildcards)
# ---------------------------------------------------------------------------
_ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",") if o.strip()]

# ---------------------------------------------------------------------------
# Rate limiter (per-IP)
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if required env vars are missing
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    if not os.getenv("API_KEY"):
        raise RuntimeError("API_KEY is not set — refusing to start unauthenticated")
    await cache.init_db()
    yield


app = FastAPI(
    title="FB Vehicle Search",
    lifespan=lifespan,
    # Hide schema endpoints in production
    docs_url=None if os.getenv("ENV", "dev") == "production" else "/docs",
    redoc_url=None if os.getenv("ENV", "dev") == "production" else "/redoc",
    openapi_url=None if os.getenv("ENV", "dev") == "production" else "/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Body size limit middleware
app.middleware("http")(limit_request_body)

# CORS — explicit origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,          # no cookies in this app
    allow_methods=["GET", "POST"],    # only what's needed
    allow_headers=["Content-Type", "X-API-Key"],
)


# ---------------------------------------------------------------------------
# Security headers on every response
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'"
    )
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Remove server fingerprint
    response.headers.pop("server", None)
    return response


# ---------------------------------------------------------------------------
# Global exception handler — never leak internal details
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again."},
    )


# ---------------------------------------------------------------------------
# Helper: enrich listings with market price, title check, affiliate links, score
# ---------------------------------------------------------------------------
async def _enrich_listings(listings: list[Listing], params: SearchParams) -> list[Listing]:
    """Enrich all listings with VIN data, market prices, scores, etc."""
    from market_price import (
        estimate_market_price, compute_price_delta_pct,
        get_title_check_url, get_carfax_url, get_autocheck_url,
        compute_quick_score,
    )

    sem = asyncio.Semaphore(5)

    async def enrich(listing: Listing) -> Listing:
        async with sem:
            raw_vin = listing.vin or (
                extract_vin(listing.description) if listing.description else None
            )
            if raw_vin:
                try:
                    vin = validate_vin(raw_vin)
                    listing.vin = vin

                    # Feature 4: affiliate links
                    listing.carfax_url = get_carfax_url(vin)
                    listing.autocheck_url = get_autocheck_url(vin)

                    decoded = await decode_vin(vin)
                    if decoded:
                        listing.decoded_vin = decoded
                        listing.make = listing.make or decoded.make
                        listing.model = listing.model or decoded.model
                        listing.year = listing.year or decoded.year
                        listing.history = await get_vehicle_history(vin, decoded)
                except ValueError:
                    pass

            # Feature 3: state title check
            listing.title_check_url = get_title_check_url(listing.location)

            return listing

    listings = list(await asyncio.gather(*[enrich(l) for l in listings]))

    # Feature 1: market price estimation (using the enriched listing set)
    for listing in listings:
        market_est = estimate_market_price(
            listing.make, listing.model, listing.year, listings
        )
        if market_est:
            listing.market_price_estimate = market_est
            listing.price_delta_pct = compute_price_delta_pct(listing.price, market_est)

        # Feature 5: quick score (server-side only, after market price is set)
        listing.quick_score = compute_quick_score(listing)

    return listings


async def _do_search(params: SearchParams) -> dict:
    """Core search logic — used by both sync and async job paths."""
    params_dict = params.model_dump()
    cached_result = await cache.get_search(params_dict)
    if cached_result:
        return cached_result

    try:
        from scraper import scrape
        listings = await scrape(params)
    except Exception as e:
        logger.error("Scrape failed: %s", e, exc_info=True)
        raise RuntimeError("Search unavailable. Please try again.")

    listings = await _enrich_listings(listings, params)

    scraped_at = datetime.now(timezone.utc).isoformat()
    result = {
        "listings": [l.model_dump() for l in listings],
        "total": len(listings),
        "scraped_at": scraped_at,
    }
    await cache.set_search(params_dict, result)
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
@limiter.limit("20/minute")
async def health(request: Request, _: None = Depends(verify_api_key)):
    """Minimal health probe — reveals no capability details."""
    return {"status": "ok"}


@app.post("/api/search", response_model=SearchResponse)
@limiter.limit("10/minute")
async def search(
    request: Request,
    params: SearchParams,
    _: None = Depends(verify_api_key),
):
    """
    Feature 10: Returns a job_id immediately; client polls /api/jobs/{job_id}.
    For backwards compatibility, also supports inline response when cached.
    """
    params_dict = params.model_dump()

    # Serve from cache immediately if available
    cached_result = await cache.get_search(params_dict)
    if cached_result:
        return SearchResponse(
            listings=[Listing(**l) for l in cached_result["listings"]],
            total=cached_result["total"],
            cached=True,
            scraped_at=cached_result.get("scraped_at"),
        )

    # Start background job
    job_id = await job_queue.create_job()

    async def _run():
        return await _do_search(params)

    asyncio.create_task(job_queue.run_job(job_id, _run()))

    # Return job info — frontend polls /api/jobs/{job_id}
    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "status": "pending"},
    )


@app.get("/api/jobs/{job_id}")
@limiter.limit("60/minute")
async def get_job(
    request: Request,
    job_id: str,
    _: None = Depends(verify_api_key),
):
    """Feature 10: Poll job status and retrieve results."""
    # Validate job_id format (token_urlsafe produces URL-safe base64)
    if len(job_id) > 64 or not job_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await job_queue.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] == "done" and job.get("result"):
        result_data = job["result"]
        try:
            listings = [Listing(**l) for l in result_data.get("listings", [])]
            return {
                "job_id": job_id,
                "status": "done",
                "result": SearchResponse(
                    listings=listings,
                    total=result_data.get("total", len(listings)),
                    cached=False,
                    scraped_at=result_data.get("scraped_at"),
                ).model_dump(),
            }
        except Exception as e:
            logger.error("Job result parsing failed: %s", e)
            raise HTTPException(status_code=500, detail="An internal error occurred.")

    # Return status without internal details
    return {
        "job_id": job_id,
        "status": job["status"],
        "error": job.get("error") if job["status"] == "failed" else None,
    }


@app.post("/api/analyze")
@limiter.limit("20/minute")
async def analyze(
    request: Request,
    req: AnalysisRequest,
    _: None = Depends(verify_api_key),
):
    """Stream AI analysis as Server-Sent Events.

    NOTE: The backend re-fetches history from the cache/NHTSA rather
    than trusting the client-supplied history object, preventing forged
    history data from influencing the AI analysis.
    """
    listing = req.listing

    # Re-fetch authoritative history from cache/NHTSA — never trust client-supplied history
    if listing.vin:
        try:
            vin = validate_vin(listing.vin)
            decoded = await decode_vin(vin)
            if decoded:
                listing.decoded_vin = decoded
                listing.history = await get_vehicle_history(vin, decoded)
        except Exception as e:
            logger.warning("History re-fetch failed for %s: %s", listing.listing_id, e)
            listing.history = None

    return StreamingResponse(
        analyze_listing_stream(listing),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/history/{vin}")
@limiter.limit("30/minute")
async def get_history(
    request: Request,
    vin: str,
    _: None = Depends(verify_api_key),
):
    try:
        vin = validate_vin(vin)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid VIN format")

    decoded = await decode_vin(vin)
    if not decoded:
        raise HTTPException(status_code=404, detail="VIN not found or invalid")
    history = await get_vehicle_history(vin, decoded)
    return history


@app.get("/api/market-price/{make}/{model}/{year}")
@limiter.limit("30/minute")
async def get_market_price(
    request: Request,
    make: str,
    model: str,
    year: int,
    _: None = Depends(verify_api_key),
):
    """Feature 1: Get cached market price estimate for a year/make/model."""
    from models import _safe_make_model
    from security import sanitise_for_log

    # Validate path params
    try:
        make_clean = _safe_make_model(make)
        model_clean = _safe_make_model(model)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid make or model")

    if not make_clean or not model_clean:
        raise HTTPException(status_code=400, detail="Make and model are required")

    if year < 1980 or year > 2030:
        raise HTTPException(status_code=400, detail="Year out of range")

    cached = await cache.get_market_price(make_clean, model_clean, year)
    if cached:
        return cached

    # No cached estimate — return empty response (estimates are built during search)
    return {
        "make": make_clean,
        "model": model_clean,
        "year": year,
        "estimated_price": None,
        "sample_count": 0,
        "computed_at": None,
    }
