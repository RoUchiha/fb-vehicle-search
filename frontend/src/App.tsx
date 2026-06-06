import { useState, useEffect, useCallback, useRef } from "react";
import { Car, Sun, Moon, Bookmark, BookmarkCheck, X, FlaskConical } from "lucide-react";
import type { SearchParams, Listing } from "./types";
import { searchListings, pollJob } from "./api";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true" || !import.meta.env.VITE_API_KEY;
import SearchForm from "./components/SearchForm";
import ListingGrid from "./components/ListingGrid";
import ComparisonTray from "./components/ComparisonTray";

const DEFAULT_PARAMS: SearchParams = {
  make: "",
  model: "",
  year_min: "",
  year_max: "",
  price_min: "",
  price_max: "",
  mileage_max: "",
  zip_code: "10001",
  radius_miles: 50,
  transmission: "any",
  condition: "any",
  sort_by: "relevance",
};

const SAVED_SEARCHES_KEY = "fb_vehicle_saved_searches";

function loadSavedSearches(): Array<{ name: string; params: SearchParams }> {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Sanitize on load: only keep entries with valid structure
    return parsed.filter(
      (e) =>
        e &&
        typeof e.name === "string" &&
        e.name.length <= 80 &&
        e.params &&
        typeof e.params.zip_code === "string"
    );
  } catch {
    return [];
  }
}

export default function App() {
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS);
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [scrapedAt, setScrapedAt] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Feature 19: Dark mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("fb_vehicle_dark_mode");
      if (stored !== null) return stored === "true";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  // Feature 14: Comparison mode
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  // Feature 17: Saved searches
  const [savedSearches, setSavedSearches] = useState<Array<{ name: string; params: SearchParams }>>(
    loadSavedSearches
  );
  const [showSavedDropdown, setShowSavedDropdown] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Apply dark mode class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try { localStorage.setItem("fb_vehicle_dark_mode", String(darkMode)); } catch {}
  }, [darkMode]);

  // Job polling — Feature 10
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await pollJob(id);
        if (job.status === "done" && job.result) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setJobId(null);
          setListings(job.result.listings);
          setTotal(job.result.total);
          setCached(false);
          setScrapedAt(job.result.scraped_at ?? null);
          setLoading(false);
        } else if (job.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setJobId(null);
          setError(job.error || "Search failed. Please try again.");
          setLoading(false);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2500);
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setError("");
    setSearched(true);
    setListings([]);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const res = await searchListings(params);

      if (res.job_id) {
        // Background job started — poll for results
        setJobId(res.job_id);
        startPolling(res.job_id);
      } else {
        // Cached result returned immediately
        setListings(res.listings);
        setTotal(res.total);
        setCached(res.cached);
        setScrapedAt(res.scraped_at ?? null);
        setJobId(null);
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setListings([]);
      setLoading(false);
    }
  };

  // Feature 17: Save current search
  const handleSaveSearch = () => {
    const name = prompt("Name this search (e.g. 'Toyota Camry under 15k'):");
    if (!name || !name.trim()) return;
    const safeName = name.trim().slice(0, 80);
    const updated = [...savedSearches.filter((s) => s.name !== safeName), { name: safeName, params }];
    setSavedSearches(updated);
    try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated)); } catch {}
  };

  const handleLoadSearch = (saved: { name: string; params: SearchParams }) => {
    setParams(saved.params);
    setShowSavedDropdown(false);
  };

  const handleDeleteSaved = (name: string) => {
    const updated = savedSearches.filter((s) => s.name !== name);
    setSavedSearches(updated);
    try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated)); } catch {}
  };

  // Feature 14: Comparison
  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      }
      return next;
    });
  };

  const compareListings = listings.filter((l) => compareIds.has(l.listing_id));

  // Feature 12: freshness display
  const freshnessLabel = (() => {
    if (!scrapedAt) return null;
    const diffMs = Date.now() - new Date(scrapedAt).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins === 1) return "1 minute ago";
    return `${mins} minutes ago`;
  })();

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="bg-slate-900 dark:bg-slate-950 border-b border-slate-800 shrink-0 z-20 no-print">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Car className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-white tracking-tight">VehicleSearch</span>
              <span className="text-slate-400 text-sm ml-2 hidden sm:inline">AI-powered marketplace scanner</span>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* NHTSA indicator */}
            <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 mr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              NHTSA + NICB live
            </span>

            {/* Feature 17: Saved searches */}
            <div className="relative">
              <button
                onClick={() => setShowSavedDropdown((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                title="Saved searches"
              >
                <Bookmark className="w-4 h-4" />
                <span className="hidden sm:inline">Saved</span>
                {savedSearches.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center">
                    {savedSearches.length}
                  </span>
                )}
              </button>

              {showSavedDropdown && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Saved Searches</span>
                    <button onClick={() => setShowSavedDropdown(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {savedSearches.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">No saved searches yet.</p>
                  ) : (
                    savedSearches.map((s) => (
                      <div key={s.name} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 group">
                        <button
                          onClick={() => handleLoadSearch(s)}
                          className="flex-1 text-left text-sm text-slate-700 dark:text-slate-200 truncate"
                        >
                          {s.name}
                        </button>
                        <button
                          onClick={() => handleDeleteSaved(s.name)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all ml-2"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                  <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-2">
                    <button
                      onClick={() => { handleSaveSearch(); setShowSavedDropdown(false); }}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <BookmarkCheck className="w-3 h-3" /> Save current search
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Feature 19: Dark mode toggle */}
            <button
              onClick={() => setDarkMode((d) => !d)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Demo mode banner */}
      {DEMO_MODE && (
        <div className="shrink-0 bg-violet-600 dark:bg-violet-700 text-white text-xs px-4 py-2 flex items-center justify-center gap-2 no-print">
          <FlaskConical className="w-3.5 h-3.5 shrink-0" />
          <span>
            <strong>Demo mode</strong> — showing sample listings with pre-computed AI analysis. To search live FB Marketplace,{" "}
            <a href="https://github.com/RoUchiha/fb-vehicle-search#backend-setup" target="_blank" rel="noopener noreferrer" className="underline hover:text-violet-200">
              run the backend locally
            </a>.
          </span>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden max-w-screen-2xl mx-auto w-full">
        <SearchForm
          params={params}
          onChange={setParams}
          onSearch={handleSearch}
          onSaveSearch={handleSaveSearch}
          loading={loading}
        />
        <div className="flex-1 flex flex-col overflow-hidden listing-grid-wrapper">
          {/* Feature 12: freshness bar */}
          {freshnessLabel && !loading && searched && (
            <div className="shrink-0 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900 px-6 py-2 flex items-center justify-between no-print">
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                Results from {freshnessLabel}
              </span>
              <button
                onClick={handleSearch}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                Refresh
              </button>
            </div>
          )}
          <ListingGrid
            listings={listings}
            loading={loading}
            error={error}
            searched={searched}
            total={total}
            cached={cached}
            jobId={jobId}
            compareIds={compareIds}
            onToggleCompare={toggleCompare}
          />
        </div>
      </div>

      {/* Feature 14: Comparison tray */}
      {compareIds.size > 0 && (
        <ComparisonTray
          listings={compareListings}
          onRemove={(id) => toggleCompare(id)}
          onClear={() => setCompareIds(new Set())}
          showFull={showCompare}
          onToggleFull={() => setShowCompare((v) => !v)}
        />
      )}
    </div>
  );
}
