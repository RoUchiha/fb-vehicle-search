import { Car, Clock } from "lucide-react";
import type { Listing } from "../types";
import ListingCard from "./ListingCard";

interface Props {
  listings: Listing[];
  loading: boolean;
  error: string;
  searched: boolean;
  total: number;
  cached: boolean;
  jobId: string | null;
  compareIds: Set<string>;
  onToggleCompare: (id: string) => void;
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="h-48 skeleton" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between gap-2">
          <div className="h-4 skeleton rounded w-3/5" />
          <div className="h-5 skeleton rounded w-1/4" />
        </div>
        <div className="flex gap-2">
          <div className="h-3 skeleton rounded w-16" />
          <div className="h-3 skeleton rounded w-12" />
          <div className="h-3 skeleton rounded w-20" />
        </div>
        <div className="h-8 skeleton rounded-lg" />
      </div>
    </div>
  );
}

export default function ListingGrid({
  listings, loading, error, searched, total, cached, jobId, compareIds, onToggleCompare
}: Props) {
  // Feature 13/20: Loading state with skeleton cards
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-5 skeleton rounded w-40" />
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 animate-pulse text-indigo-500" />
            {jobId ? "Scanning Marketplace… this takes 30–60s" : "Searching…"}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-8 max-w-md text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <Car className="w-6 h-6 text-red-500" />
          </div>
          <p className="font-semibold text-red-700 dark:text-red-400 mb-2">Search Failed</p>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            Make sure the backend is running and you're logged into Facebook in the configured browser profile.
          </p>
        </div>
      </div>
    );
  }

  if (!searched) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-slate-400 dark:text-slate-600">
        {/* Illustrated SVG empty state */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
            <svg viewBox="0 0 80 80" className="w-16 h-16" fill="none">
              <rect x="8" y="30" width="52" height="28" rx="6" fill="#e0e7ff" />
              <rect x="4" y="44" width="60" height="16" rx="5" fill="#c7d2fe" />
              <circle cx="18" cy="60" r="8" fill="#818cf8" />
              <circle cx="46" cy="60" r="8" fill="#818cf8" />
              <circle cx="18" cy="60" r="4" fill="#fff" />
              <circle cx="46" cy="60" r="4" fill="#fff" />
              <rect x="22" y="24" width="22" height="14" rx="3" fill="#a5b4fc" />
              <path d="M60 20 L72 32 L60 44 L56 40 L65 32 L56 24 Z" fill="#6366f1" opacity="0.6" />
            </svg>
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-white fill-white">
              <path d="M6.5 1a5.5 5.5 0 1 0 3.613 9.677L13.354 14l1.06-1.06-3.24-3.24A5.5 5.5 0 0 0 6.5 1zM2 6.5a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0z"/>
            </svg>
          </div>
        </div>
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">Ready to find your next vehicle</p>
          <p className="text-sm mt-1 text-slate-400 dark:text-slate-500">
            Set your filters and hit Search. We'll pull live listings from Facebook Marketplace with NHTSA recall history and AI analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-1">
          {["NHTSA Recalls", "NICB Theft Check", "AI Deal Score", "Market Pricing"].map((tip) => (
            <span key={tip} className="text-xs px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-900">
              {tip}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-slate-400 dark:text-slate-600">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Car className="w-8 h-8 text-slate-300 dark:text-slate-600" />
        </div>
        <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">No listings found</p>
        <p className="text-sm">Try broadening your filters — increase radius or price range.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Results header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className="font-bold text-slate-800 dark:text-slate-100">
          {total.toLocaleString()} {total === 1 ? "listing" : "listings"} found
        </h2>
        {cached && (
          <span className="text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900 font-medium">
            Cached
          </span>
        )}
        {compareIds.size > 0 && (
          <span className="text-xs bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 px-2.5 py-0.5 rounded-full border border-violet-100 dark:border-violet-900 font-medium">
            {compareIds.size} selected to compare
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {listings.map((l) => (
          <ListingCard
            key={l.listing_id}
            listing={l}
            allListings={listings}
            isComparing={compareIds.has(l.listing_id)}
            compareCount={compareIds.size}
            onToggleCompare={() => onToggleCompare(l.listing_id)}
          />
        ))}
      </div>
    </div>
  );
}
