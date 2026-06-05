import type { SearchParams, Listing, AnalysisResult, SseEvent, JobResponse } from "./types";

const BASE = "/api";
const REQUEST_TIMEOUT_MS = 90_000; // 90 s — scrape can be slow

// API key loaded once from env at build time (Vite exposes VITE_* vars)
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

function apiHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
  };
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** Validate that a URL string has an http/https scheme before use. */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function searchListings(
  params: SearchParams
): Promise<{ listings: Listing[]; total: number; cached: boolean; scraped_at: string | null; job_id?: string; status?: string }> {
  const res = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: apiHeaders(),
    signal: withTimeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      ...params,
      year_min: params.year_min ? parseInt(params.year_min, 10) : null,
      year_max: params.year_max ? parseInt(params.year_max, 10) : null,
      price_min: params.price_min ? parseInt(params.price_min, 10) : null,
      price_max: params.price_max ? parseInt(params.price_max, 10) : null,
      mileage_max: params.mileage_max ? parseInt(params.mileage_max, 10) : null,
      make: params.make || null,
      model: params.model || null,
    }),
  });

  if (res.status === 202) {
    // Background job started
    const data = await res.json();
    return { listings: [], total: 0, cached: false, scraped_at: null, job_id: data.job_id, status: "pending" };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Search failed" }));
    throw new Error(typeof err.detail === "string" ? err.detail : "Search failed");
  }
  return res.json();
}

export async function pollJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(jobId)}`, {
    headers: apiHeaders(),
    signal: withTimeout(15_000),
  });
  if (!res.ok) throw new Error("Job poll failed");
  return res.json();
}

export async function analyzeListingStream(
  listing: Listing,
  onChunk: (text: string) => void,
  onResult: (result: AnalysisResult) => void,
  onError: (msg: string) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/analyze`, {
      method: "POST",
      headers: apiHeaders(),
      signal: withTimeout(120_000), // analysis can take up to 2 min
      body: JSON.stringify({ listing_id: listing.listing_id, listing }),
    });
  } catch (e) {
    onError(e instanceof Error && e.name === "TimeoutError" ? "Analysis timed out." : "Network error");
    return;
  }

  if (!res.ok || !res.body) {
    // Only show a safe generic message — do not echo server error details to the user
    onError("Analysis unavailable. Please try again.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event: SseEvent = JSON.parse(line.slice(6));
          if (event.type === "chunk") onChunk(event.text);
          if (event.type === "result") onResult(event.data);
          if (event.type === "error") onError(event.message);
        } catch {
          // malformed SSE line — skip silently
        }
      }
    }
  } catch {
    onError("Connection lost during analysis.");
  }
}

export async function getHistory(vin: string) {
  const res = await fetch(`${BASE}/history/${encodeURIComponent(vin)}`, {
    headers: apiHeaders(),
    signal: withTimeout(15_000),
  });
  if (!res.ok) throw new Error("History fetch failed");
  return res.json();
}
