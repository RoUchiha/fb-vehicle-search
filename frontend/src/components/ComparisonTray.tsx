import { X, GitCompare, ChevronUp, ChevronDown } from "lucide-react";
import type { Listing } from "../types";
import DealScoreBadge from "./DealScoreBadge";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Props {
  listings: Listing[];
  onRemove: (id: string) => void;
  onClear: () => void;
  showFull: boolean;
  onToggleFull: () => void;
}

function PriceDelta({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return <span className="text-slate-400">—</span>;
  if (pct < -3) return <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs"><TrendingDown className="w-3 h-3" />{Math.abs(pct).toFixed(0)}% below</span>;
  if (pct > 3) return <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400 font-semibold text-xs"><TrendingUp className="w-3 h-3" />{Math.abs(pct).toFixed(0)}% above</span>;
  return <span className="flex items-center gap-0.5 text-slate-500 text-xs"><Minus className="w-3 h-3" />Market</span>;
}

export default function ComparisonTray({ listings, onRemove, onClear, showFull, onToggleFull }: Props) {
  return (
    <>
      {/* Full-screen comparison modal */}
      {showFull && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-slate-900 dark:text-slate-100 text-lg flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-violet-500" />
                Side-by-Side Comparison
              </h2>
              <button
                onClick={onToggleFull}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider pb-4 w-36 pr-4">
                      Metric
                    </th>
                    {listings.map((l) => {
                      const name = [l.year, l.make, l.model].filter(Boolean).join(" ") || l.title;
                      return (
                        <th key={l.listing_id} className="pb-4 px-3 min-w-[160px]">
                          <div className="flex flex-col items-center gap-2">
                            {l.images[0] ? (
                              <img src={l.images[0]} alt={name} className="w-full h-24 object-cover rounded-xl" />
                            ) : (
                              <div className="w-full h-24 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                                <span className="text-xs text-slate-400">No image</span>
                              </div>
                            )}
                            <div className="text-center">
                              <p className="font-semibold text-slate-800 dark:text-slate-100 text-xs leading-tight">{name}</p>
                              <button
                                onClick={() => onRemove(l.listing_id)}
                                className="mt-1 text-xs text-red-400 hover:text-red-600 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    { label: "Price", render: (l: Listing) => <span className="font-bold text-slate-800 dark:text-slate-100">{l.price ? `$${l.price.toLocaleString()}` : "—"}</span> },
                    { label: "Deal Score", render: (l: Listing) => <DealScoreBadge score={l.quick_score} /> },
                    { label: "vs Market", render: (l: Listing) => <PriceDelta pct={l.price_delta_pct} /> },
                    { label: "Mileage", render: (l: Listing) => <span>{l.mileage ? `${l.mileage.toLocaleString()} mi` : "—"}</span> },
                    { label: "Year", render: (l: Listing) => <span>{l.year ?? "—"}</span> },
                    { label: "Seller", render: (l: Listing) => <span className="capitalize">{l.seller_type}</span> },
                    { label: "Recalls", render: (l: Listing) => (
                      <span className={l.history?.recall_count ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-emerald-600 dark:text-emerald-400"}>
                        {l.history?.recall_count ?? "—"}
                      </span>
                    )},
                    { label: "NICB Flag", render: (l: Listing) => (
                      <span className={
                        l.history?.nicb_stolen ? "text-red-600 dark:text-red-400 font-bold" :
                        l.history?.nicb_salvage ? "text-orange-500 font-semibold" :
                        "text-emerald-600 dark:text-emerald-400"
                      }>
                        {l.history?.nicb_stolen ? "STOLEN" : l.history?.nicb_salvage ? "Salvage" : l.history ? "Clear" : "—"}
                      </span>
                    )},
                    { label: "Engine", render: (l: Listing) => <span>{l.decoded_vin?.engine ? `${l.decoded_vin.engine}L` : "—"}</span> },
                    { label: "Drive", render: (l: Listing) => <span>{l.decoded_vin?.drive_type ?? "—"}</span> },
                    { label: "Location", render: (l: Listing) => <span className="text-xs">{l.location || "—"}</span> },
                  ].map(({ label, render }) => (
                    <tr key={label}>
                      <td className="py-3 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</td>
                      {listings.map((l) => (
                        <td key={l.listing_id} className="py-3 px-3 text-center text-sm text-slate-700 dark:text-slate-300">
                          {render(l)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom tray */}
      <div className="fixed bottom-0 left-0 right-0 z-40 no-print">
        <div className="max-w-screen-2xl mx-auto px-4 pb-3">
          <div className="bg-slate-900 dark:bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-300 shrink-0">
              Compare ({listings.length}/4)
            </span>

            {/* Thumbnails */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto">
              {listings.map((l) => {
                const name = [l.year, l.make, l.model].filter(Boolean).join(" ") || l.title;
                return (
                  <div key={l.listing_id} className="flex items-center gap-1.5 bg-slate-800 rounded-xl px-2 py-1.5 shrink-0">
                    {l.images[0] && (
                      <img src={l.images[0]} alt={name} className="w-8 h-8 rounded-lg object-cover" />
                    )}
                    <span className="text-xs text-slate-200 max-w-[100px] truncate">{name}</span>
                    {l.quick_score !== null && l.quick_score !== undefined && (
                      <span className={`text-xs font-bold px-1.5 rounded-full ${l.quick_score >= 70 ? "bg-emerald-500/20 text-emerald-400" : l.quick_score >= 40 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                        {l.quick_score}
                      </span>
                    )}
                    <button
                      onClick={() => onRemove(l.listing_id)}
                      className="text-slate-500 hover:text-slate-300 transition-colors ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onToggleFull}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <GitCompare className="w-3.5 h-3.5" />
                Compare
                {showFull ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
              <button
                onClick={onClear}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
