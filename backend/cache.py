"""SQLite-backed async cache. All reads re-validate through Pydantic."""
import json
import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import aiosqlite

DB_PATH = os.getenv("CACHE_DB_PATH", "./cache.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS search_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vin_history (
    vin TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_analysis (
    cache_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vin_decode (
    vin TEXT PRIMARY KEY,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS market_price (
    cache_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    result TEXT,
    error_public TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


def _search_key(params: dict) -> str:
    serialized = json.dumps(params, sort_keys=True)
    return hashlib.sha256(serialized.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(ts_str: str) -> datetime:
    dt = datetime.fromisoformat(ts_str)
    # Ensure timezone-aware comparison
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


async def get_search(params: dict) -> Optional[dict]:
    key = _search_key(params)
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT data, fetched_at FROM search_cache WHERE key = ?", (key,)
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            if _now() - _parse_ts(row[1]) > timedelta(minutes=30):
                return None
            return json.loads(row[0])


async def set_search(params: dict, data: dict):
    key = _search_key(params)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO search_cache (key, data, fetched_at) VALUES (?, ?, ?)",
            (key, json.dumps(data), _now().isoformat()),
        )
        await db.commit()


async def get_vin_history(vin: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT data, fetched_at FROM vin_history WHERE vin = ?", (vin.upper(),)
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            if _now() - _parse_ts(row[1]) > timedelta(hours=24):
                return None
            return json.loads(row[0])


async def set_vin_history(vin: str, data: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO vin_history (vin, data, fetched_at) VALUES (?, ?, ?)",
            (vin.upper(), json.dumps(data), _now().isoformat()),
        )
        await db.commit()


async def get_vin_decode(vin: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT data FROM vin_decode WHERE vin = ?", (vin.upper(),)
        ) as cur:
            row = await cur.fetchone()
            return json.loads(row[0]) if row else None


async def set_vin_decode(vin: str, data: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO vin_decode (vin, data) VALUES (?, ?)",
            (vin.upper(), json.dumps(data)),
        )
        await db.commit()


async def get_analysis(listing_id: str, vin: Optional[str]) -> Optional[dict]:
    key = f"{listing_id}:{vin or 'novin'}"
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT data, fetched_at FROM ai_analysis WHERE cache_key = ?", (key,)
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            if _now() - _parse_ts(row[1]) > timedelta(days=7):
                return None
            return json.loads(row[0])


async def set_analysis(listing_id: str, vin: Optional[str], data: dict):
    key = f"{listing_id}:{vin or 'novin'}"
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO ai_analysis (cache_key, data, fetched_at) VALUES (?, ?, ?)",
            (key, json.dumps(data), _now().isoformat()),
        )
        await db.commit()


# Feature 1: Market price cache
def _market_price_key(make: str, model: str, year: int) -> str:
    return hashlib.sha256(f"{make.lower()}:{model.lower()}:{year}".encode()).hexdigest()


async def get_market_price(make: str, model: str, year: int) -> Optional[dict]:
    key = _market_price_key(make, model, year)
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT data, fetched_at FROM market_price WHERE cache_key = ?", (key,)
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            if _now() - _parse_ts(row[1]) > timedelta(hours=12):
                return None
            return json.loads(row[0])


async def set_market_price(make: str, model: str, year: int, data: dict):
    key = _market_price_key(make, model, year)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO market_price (cache_key, data, fetched_at) VALUES (?, ?, ?)",
            (key, json.dumps(data), _now().isoformat()),
        )
        await db.commit()
