"""Centralised security utilities: validation, sanitisation, auth."""
import hmac
import os
import re
from typing import Optional

from fastapi import Header, HTTPException, Request, status

# ---------------------------------------------------------------------------
# API key auth — shared secret via X-API-Key header
# ---------------------------------------------------------------------------
_API_KEY = os.getenv("API_KEY", "")

def _require_api_key_configured() -> None:
    if not _API_KEY:
        raise RuntimeError(
            "API_KEY env var must be set before starting the server."
        )

async def verify_api_key(x_api_key: str = Header(default="")) -> None:
    """FastAPI dependency — raises 401 if key missing or wrong."""
    if not _API_KEY:
        # Misconfiguration: block all requests until fixed
        raise HTTPException(status_code=503, detail="Service not configured")
    if not x_api_key or not hmac.compare_digest(x_api_key, _API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ---------------------------------------------------------------------------
# VIN validation
# ---------------------------------------------------------------------------
_VIN_RE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')

def validate_vin(vin: str) -> str:
    """Raise ValueError if vin is not a valid 17-char VIN."""
    vin = vin.upper().strip()
    if not _VIN_RE.match(vin):
        raise ValueError(f"Invalid VIN format: {vin!r}")
    return vin


# ---------------------------------------------------------------------------
# URL scheme validation — prevent javascript: and data: hrefs
# ---------------------------------------------------------------------------
_SAFE_SCHEMES = {"http", "https"}

def safe_url(url: str) -> str:
    """Return url unchanged or raise ValueError for unsafe schemes."""
    lowered = url.lower().strip()
    scheme = lowered.split(":", 1)[0] if ":" in lowered else ""
    if scheme not in _SAFE_SCHEMES:
        raise ValueError(f"Unsafe URL scheme: {scheme!r}")
    return url


# ---------------------------------------------------------------------------
# Prompt-injection sanitisation
# ---------------------------------------------------------------------------
# Remove sequences that try to break out of the user-content block
_PROMPT_INJECTION_RE = re.compile(
    r'(ignore\s+(all\s+)?(previous|prior|above)\s+instructions?'
    r'|system\s*:\s*'
    r'|<\s*/?system\s*>'
    r'|###\s*system'
    r'|you\s+are\s+now'
    r'|\[INST\]|\[/INST\])',
    re.IGNORECASE,
)

def sanitise_for_prompt(text: str, max_len: int = 2000) -> str:
    """Strip prompt-injection patterns and truncate."""
    if not text:
        return ""
    cleaned = _PROMPT_INJECTION_RE.sub("[REDACTED]", text)
    return cleaned[:max_len]


# ---------------------------------------------------------------------------
# Generic string sanitisation for log messages
# ---------------------------------------------------------------------------
_LOG_SAFE_RE = re.compile(r'[^\w\s,.\-/()+@#:_]')

def sanitise_for_log(value: Optional[str]) -> str:
    if not value:
        return ""
    return _LOG_SAFE_RE.sub("?", value[:200])


# ---------------------------------------------------------------------------
# Request body size limit (used as middleware)
# ---------------------------------------------------------------------------
MAX_BODY_BYTES = 512 * 1024  # 512 KB

async def limit_request_body(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Request body too large",
        )
    return await call_next(request)
