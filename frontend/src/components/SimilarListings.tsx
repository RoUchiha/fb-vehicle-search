import type { Listing } from "../types";
import DealScoreBadge from "./DealScoreBadge";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Props {
  listing: Listing;
  allListings: Listing[];
}

export default function SimilarListings({ listing, allListings }: Props) {
  const similar = allListings
    .filter((l) => {
      if (l.listing_id === listing.listing_id) return false;
      // Same make/model
      const sameMakeModel =
        l.make && listing.make && l.model && listing.model &&
        l.make.toLowerCase() === listing.make?.toLowerCase() &&
        l.model.toLowerCase() === listing.model?.toLowerCase();
      // Or similar price range (within 15%)
      const similarPrice =
        l.price && listing.price &&
        Math.abs(l.price - listing.price) / listing.price < 0.15;
      return sameMakeModel || similarPrice;
    })
    .sort((a, b) => (b.quick_score ?? 0) - (a.quick_score ?? 0))
    .slice(0, 3);

  if (similar.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
        Similar Listings in Results
      </h4>
      <div className="space-y-2">
        {similar.map((l) => {
          const name = [l.year, l.make, l.model].filter(Boolean).join(" ") || l.title;
          const pct = l.price_delta_pct;
          return (
            <div
              key={l.listing_id}
              className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
            >
              {/* Thumbnail */}
              <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                {l.images[0] && (
                  <img src={l.images[0]} alt={name} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{name}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{l.price ? `$${l.price.toLocaleString()}` : "—"}</span>
                  {l.mileage && <span>{l.mileage.toLocaleString()} mi</span>}
                  {pct !== null && pct !== undefined && (
                    <span className={`flex items-center gap-0.5 ${pct < -3 ? "text-emerald-600" : pct > 3 ? "text-red-500" : "text-slate-400"}`}>
                      {pct < -3 ? <TrendingDown className="w-3 h-3" /> : pct > 3 ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {Math.abs(pct).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <DealScoreBadge score={l.quick_score} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
