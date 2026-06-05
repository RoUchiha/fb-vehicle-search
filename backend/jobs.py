"""
Asyncio in-process background job queue with SQLite persistence.

Job IDs are cryptographically random (secrets.token_urlsafe).
Internal error details are never exposed in status responses.
"""
import asyncio
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Optional

import aiosqlite

import cache

logger = logging.getLogger(__name__)

_JOBS_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    result TEXT,
    error_public TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

_ALLOWED_STATUSES = {"pending", "running", "done", "failed"}


async def _ensure_jobs_table():
    async with aiosqlite.connect(cache.DB_PATH) as db:
        await db.executescript(_JOBS_SCHEMA)
        await db.commit()


async def create_job() -> str:
    """Create a new job record and return a cryptographically random job ID."""
    job_id = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc).isoformat()
    await _ensure_jobs_table()
    async with aiosqlite.connect(cache.DB_PATH) as db:
        await db.execute(
            "INSERT INTO jobs (job_id, status, created_at, updated_at) VALUES (?, 'pending', ?, ?)",
            (job_id, now, now),
        )
        await db.commit()
    return job_id


async def get_job(job_id: str) -> Optional[dict]:
    """Return job status dict, or None if not found. Never exposes internal errors."""
    await _ensure_jobs_table()
    async with aiosqlite.connect(cache.DB_PATH) as db:
        async with db.execute(
            "SELECT status, result, error_public, created_at, updated_at FROM jobs WHERE job_id = ?",
            (job_id,),
        ) as cur:
            row = await cur.fetchone()
            if not row:
                return None
            status, result_json, error_public, created_at, updated_at = row
            out: dict[str, Any] = {
                "job_id": job_id,
                "status": status,
                "created_at": created_at,
                "updated_at": updated_at,
            }
            if status == "done" and result_json:
                try:
                    out["result"] = json.loads(result_json)
                except Exception:
                    out["result"] = None
            if status == "failed":
                # Only show a safe public message
                out["error"] = error_public or "Search failed. Please try again."
            return out


async def _update_job(job_id: str, status: str, result: Any = None, error_public: str = ""):
    now = datetime.now(timezone.utc).isoformat()
    result_json = json.dumps(result) if result is not None else None
    async with aiosqlite.connect(cache.DB_PATH) as db:
        await db.execute(
            "UPDATE jobs SET status=?, result=?, error_public=?, updated_at=? WHERE job_id=?",
            (status, result_json, error_public, now, job_id),
        )
        await db.commit()


async def run_job(
    job_id: str,
    coro: Coroutine,
):
    """Run a coroutine as a background job, updating status in SQLite."""
    await _update_job(job_id, "running")
    try:
        result = await coro
        await _update_job(job_id, "done", result=result)
    except Exception as e:
        logger.error("Job %s failed: %s", job_id, e, exc_info=True)
        # Never expose internal error details
        await _update_job(job_id, "failed", error_public="Search failed. Please try again.")
