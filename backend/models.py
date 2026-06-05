from __future__ import annotations
import re
from typing import Annotated, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Field constraints
# ---------------------------------------------------------------------------
_VIN_RE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
_ZIP_RE = re.compile(r'^\d{5}(-\d{4})?$')
_SAFE_STR_RE = re.compile(r'^[\w\s\-.,/()+&\']+$')  # printable, no shell metacharacters

CURRENT_YEAR = 2030  # upper-bound; permissive future buffer

SafeStr100 = Annotated[str, Field(min_length=1, max_length=100)]
SafeStr200 = Annotated[str, Field(min_length=0, max_length=200)]


def _safe_make_model(v: Optional[str]) -> Optional[str]:
    """Validate make/model: alphanumeric + common chars only, bounded."""
    if v is None:
        return v
    v = v.strip()
    if not v:
        return None
    if len(v) > 60:
        raise ValueError("make/model too long (max 60 chars)")
    if not _SAFE_STR_RE.match(v):
        raise ValueError(f"make/model contains disallowed characters: {v!r}")
    return v


class SearchParams(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    year_min: Optional[int] = Field(default=None, ge=1980, le=CURRENT_YEAR)
    year_max: Optional[int] = Field(default=None, ge=1980, le=CURRENT_YEAR)
    price_min: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    price_max: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    mileage_max: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    zip_code: str = "10001"
    # Feature 9: multi-ZIP search (max 5, each validated)
    zip_codes: Optional[list[str]] = Field(default=None, max_length=5)
    radius_miles: int = Field(default=50, ge=1, le=500)
    transmission: str = "any"
    condition: str = "any"
    sort_by: str = "relevance"

    @field_validator("make", "model", mode="before")
    @classmethod
    def validate_make_model(cls, v: Optional[str]) -> Optional[str]:
        return _safe_make_model(v)

    @field_validator("zip_code")
    @classmethod
    def validate_zip(cls, v: str) -> str:
        v = v.strip()
        if not _ZIP_RE.match(v):
            raise ValueError("zip_code must be a 5-digit US ZIP code")
        return v

    @field_validator("zip_codes", mode="before")
    @classmethod
    def validate_zip_codes(cls, v: Optional[list]) -> Optional[list]:
        if v is None:
            return None
        validated = []
        for z in v[:5]:  # enforce max 5
            z = str(z).strip()
            if not _ZIP_RE.match(z):
                raise ValueError(f"zip_codes entry must be a 5-digit US ZIP code: {z!r}")
            validated.append(z)
        return validated

    @field_validator("transmission")
    @classmethod
    def validate_transmission(cls, v: str) -> str:
        allowed = {"any", "automatic", "manual"}
        if v not in allowed:
            raise ValueError(f"transmission must be one of {allowed}")
        return v

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v: str) -> str:
        allowed = {"any", "excellent", "good", "fair"}
        if v not in allowed:
            raise ValueError(f"condition must be one of {allowed}")
        return v

    @field_validator("sort_by")
    @classmethod
    def validate_sort_by(cls, v: str) -> str:
        allowed = {"relevance", "price_asc", "price_desc", "mileage_asc", "newest"}
        if v not in allowed:
            raise ValueError(f"sort_by must be one of {allowed}")
        return v

    @model_validator(mode="after")
    def validate_year_range(self) -> "SearchParams":
        if self.year_min and self.year_max and self.year_min > self.year_max:
            raise ValueError("year_min must be ≤ year_max")
        if self.price_min and self.price_max and self.price_min > self.price_max:
            raise ValueError("price_min must be ≤ price_max")
        return self


class Recall(BaseModel):
    recall_id: str = Field(max_length=50)
    component: str = Field(max_length=300)
    summary: str = Field(max_length=2000)
    consequence: str = Field(max_length=2000)
    remedy: str = Field(max_length=2000)
    date: str = Field(max_length=50)


class Complaint(BaseModel):
    odometer: Optional[int] = Field(default=None, ge=0, le=2_000_000)
    incident_date: Optional[str] = Field(default=None, max_length=50)
    component: str = Field(max_length=300)
    summary: str = Field(max_length=2000)


class VehicleHistory(BaseModel):
    vin: str = Field(min_length=17, max_length=17)
    recall_count: int = Field(default=0, ge=0)
    open_recall_count: int = Field(default=0, ge=0)
    recalls: list[Recall] = Field(default_factory=list, max_length=100)
    complaint_count: int = Field(default=0, ge=0)
    complaints: list[Complaint] = Field(default_factory=list, max_length=200)
    nicb_stolen: Optional[bool] = None
    nicb_salvage: Optional[bool] = None
    fetched_at: str = Field(max_length=50)

    @field_validator("vin")
    @classmethod
    def validate_vin(cls, v: str) -> str:
        v = v.upper().strip()
        if not _VIN_RE.match(v):
            raise ValueError("Invalid VIN format")
        return v


class DecodedVIN(BaseModel):
    vin: str = Field(min_length=17, max_length=17)
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=1980, le=CURRENT_YEAR)
    trim: Optional[str] = Field(default=None, max_length=100)
    engine: Optional[str] = Field(default=None, max_length=50)
    transmission: Optional[str] = Field(default=None, max_length=100)
    drive_type: Optional[str] = Field(default=None, max_length=50)
    body_style: Optional[str] = Field(default=None, max_length=100)
    plant_country: Optional[str] = Field(default=None, max_length=100)


class MarketPriceEstimate(BaseModel):
    """Feature 1: Market price comparison."""
    make: str = Field(max_length=100)
    model: str = Field(max_length=100)
    year: int = Field(ge=1980, le=CURRENT_YEAR)
    estimated_price: int = Field(ge=0)
    sample_count: int = Field(ge=0)
    computed_at: str = Field(max_length=50)


class Listing(BaseModel):
    listing_id: str = Field(min_length=1, max_length=50, pattern=r'^\d+$')
    url: str = Field(min_length=1, max_length=500)
    title: str = Field(default="", max_length=300)
    price: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    year: Optional[int] = Field(default=None, ge=1980, le=CURRENT_YEAR)
    make: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=100)
    trim: Optional[str] = Field(default=None, max_length=100)
    mileage: Optional[int] = Field(default=None, ge=0, le=2_000_000)
    location: str = Field(default="", max_length=200)
    seller_name: str = Field(default="", max_length=200)
    seller_type: str = "unknown"
    posted_at: Optional[str] = Field(default=None, max_length=50)
    images: list[str] = Field(default_factory=list, max_length=20)
    description: str = Field(default="", max_length=10_000)
    vin: Optional[str] = Field(default=None, max_length=17)
    decoded_vin: Optional[DecodedVIN] = None
    history: Optional[VehicleHistory] = None
    # Feature 1: market price
    market_price_estimate: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    price_delta_pct: Optional[float] = None  # negative = below market
    # Feature 3: state title check
    title_check_url: Optional[str] = Field(default=None, max_length=500)
    # Feature 4: affiliate links
    carfax_url: Optional[str] = Field(default=None, max_length=500)
    autocheck_url: Optional[str] = Field(default=None, max_length=500)
    # Feature 5: pre-computed deal score (server-side only, never trust client)
    quick_score: Optional[int] = Field(default=None, ge=0, le=100)
    # Feature 12: freshness
    scraped_at: Optional[str] = Field(default=None, max_length=50)

    @field_validator("seller_type")
    @classmethod
    def validate_seller_type(cls, v: str) -> str:
        allowed = {"private", "dealer", "unknown"}
        return v if v in allowed else "unknown"

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("https://www.facebook.com/", "https://facebook.com/")):
            raise ValueError("Listing URL must be a Facebook Marketplace URL")
        return v

    @field_validator("images", mode="before")
    @classmethod
    def validate_images(cls, v: list) -> list:
        # Only allow known FB CDN image domains
        safe = []
        for img in v[:20]:
            if isinstance(img, str) and (
                "scontent" in img or "fbcdn" in img
            ) and img.startswith("https://"):
                safe.append(img[:1000])
        return safe

    @field_validator("vin")
    @classmethod
    def validate_vin_field(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.upper().strip()
        if not _VIN_RE.match(v):
            return None  # Silently discard invalid VINs rather than erroring
        return v


class SearchResponse(BaseModel):
    listings: list[Listing]
    total: int = Field(ge=0)
    cached: bool = False
    # Feature 12: result freshness
    scraped_at: Optional[str] = None


class JobResponse(BaseModel):
    """Feature 10: background job response."""
    job_id: str
    status: str


class AnalysisRequest(BaseModel):
    listing_id: str = Field(min_length=1, max_length=50, pattern=r'^\d+$')
    listing: Listing

    @model_validator(mode="after")
    def ids_must_match(self) -> "AnalysisRequest":
        if self.listing_id != self.listing.listing_id:
            raise ValueError("listing_id must match listing.listing_id")
        return self


class OwnershipCost(BaseModel):
    """Feature 6: long-term ownership cost fields."""
    annual_maintenance_estimate: Optional[int] = Field(default=None, ge=0, le=100_000)
    common_repair_costs: list[str] = Field(default_factory=list, max_length=10)
    insurance_tier: Optional[str] = None
    fuel_cost_annual_estimate: Optional[int] = Field(default=None, ge=0, le=50_000)

    @field_validator("insurance_tier")
    @classmethod
    def validate_insurance_tier(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        allowed = {"low", "medium", "high"}
        return v if v in allowed else None


class AnalysisResult(BaseModel):
    listing_id: str = Field(min_length=1, max_length=50)
    reliability_summary: str = Field(max_length=2000)
    known_pain_points: list[str] = Field(default_factory=list, max_length=20)
    maintenance_at_mileage: list[str] = Field(default_factory=list, max_length=20)
    inspection_checklist: list[str] = Field(default_factory=list, max_length=30)
    seller_questions: list[str] = Field(default_factory=list, max_length=20)
    recall_warnings: list[str] = Field(default_factory=list, max_length=20)
    buy_rating: str
    buy_score: int = Field(ge=1, le=10)
    buy_rationale: str = Field(max_length=2000)
    price_assessment: str
    # Feature 6: ownership cost
    ownership_cost: Optional[OwnershipCost] = None
    # Feature 7: negotiation script
    negotiation_script: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("buy_rating")
    @classmethod
    def validate_buy_rating(cls, v: str) -> str:
        allowed = {"BUY", "CAUTION", "AVOID"}
        if v not in allowed:
            raise ValueError(f"buy_rating must be one of {allowed}")
        return v

    @field_validator("price_assessment")
    @classmethod
    def validate_price_assessment(cls, v: str) -> str:
        allowed = {"underpriced", "fair", "overpriced", "unknown"}
        if v not in allowed:
            return "unknown"
        return v
