import type { SearchParams, Listing, AnalysisResult, SseEvent, JobResponse } from "./types";
import { MOCK_LISTINGS, getMockAnalysisStream } from "./demo/mockData";

// If VITE_API_BASE_URL is set (e.g. https://fb-vehicle-search-api.fly.dev),
// use it — otherwise fall back to relative /api (proxied by Vite in dev)
const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : "/api";

const REQUEST_TIMEOUT_MS = 90_000; // 90 s — scrape can be slow

// API key loaded once from env at build time (Vite exposes VITE_* vars)
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

// Demo mode: active when VITE_DEMO_MODE=true (set on Vercel) or when no API key is configured
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true" || !API_KEY;

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

/** Filter mock listings by search params for a realistic demo experience. */
function filterMockListings(params: SearchParams): Listing[] {
  let results = [...MOCK_LISTINGS];

  if (params.make) {
    results = results.filter((l) =>
      l.make?.toLowerCase().includes(params.make!.toLowerCase())
    );
  }
  if (params.model) {
    results = results.filter((l) =>
      l.model?.toLowerCase().includes(params.model!.toLowerCase())
    );
  }
  if (params.year_min) {
    const min = parseInt(params.year_min, 10);
    results = results.filter((l) => !l.year || l.year >= min);
  }
  if (params.year_max) {
    const max = parseInt(params.year_max, 10);
    results = results.filter((l) => !l.year || l.year <= max);
  }
  if (params.price_min) {
    const min = parseInt(params.price_min, 10);
    results = results.filter((l) => !l.price || l.price >= min);
  }
  if (params.price_max) {
    const max = parseInt(params.price_max, 10);
    results = results.filter((l) => !l.price || l.price <= max);
  }
  if (params.mileage_max) {
    const max = parseInt(params.mileage_max, 10);
    results = results.filter((l) => !l.mileage || l.mileage <= max);
  }
  if (params.transmission && params.transmission !== "any") {
    results = results.filter(
      (l) =>
        !l.decoded_vin?.transmission ||
        l.decoded_vin.transmission.toLowerCase().includes(params.transmission!)
    );
  }

  // Sort
  if (params.sort_by === "price_asc") {
    results.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  } else if (params.sort_by === "price_desc") {
    results.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  } else if (params.sort_by === "mileage_asc") {
    results.sort((a, b) => (a.mileage ?? 0) - (b.mileage ?? 0));
  } else {
    // Default: sort by deal score
    results.sort((a, b) => (b.quick_score ?? 0) - (a.quick_score ?? 0));
  }

  return results;
}

export async function searchListings(
  params: SearchParams
): Promise<{ listings: Listing[]; total: number; cached: boolean; scraped_at: string | null; job_id?: string; status?: string }> {
  if (DEMO_MODE) {
    // Simulate a realistic 1.5s scrape delay
    await new Promise((r) => setTimeout(r, 1500));
    const listings = filterMockListings(params);
    return {
      listings,
      total: listings.length,
      cached: false,
      scraped_at: new Date().toISOString(),
    };
  }

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
  if (DEMO_MODE) {
    // Simulate 500ms startup delay then stream mock analysis
    await new Promise((r) => setTimeout(r, 500));
    getMockAnalysisStream(listing.vin ?? "", onChunk, onResult);
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/analyze`, {
      method: "POST",
      headers: apiHeaders(),
      signal: withTimeout(120_000),
      body: JSON.stringify({ listing_id: listing.listing_id, listing }),
    });
  } catch (e) {
    onError(e instanceof Error && e.name === "TimeoutError" ? "Analysis timed out." : "Network error");
    return;
  }

  if (!res.ok || !res.body) {
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
  if (DEMO_MODE) return null;
  const res = await fetch(`${BASE}/history/${encodeURIComponent(vin)}`, {
    headers: apiHeaders(),
    signal: withTimeout(15_000),
  });
  if (!res.ok) throw new Error("History fetch failed");
  return res.json();
}
