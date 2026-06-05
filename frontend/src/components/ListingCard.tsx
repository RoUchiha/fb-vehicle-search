import { useState } from "react";
import {
  MapPin, Gauge, Calendar, User, Building2, ExternalLink,
  ChevronDown, ChevronUp, Car, GitCompare, Printer,
  DollarSign, TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import type { Listing } from "../types";
import { isSafeUrl } from "../api";
import HistoryBadges from "./HistoryBadges";
import AiAnalysisPanel from "./AiAnalysisPanel";
import DealScoreBadge from "./DealScoreBadge";
import FinancingCalculator from "./FinancingCalculator";
import SimilarListings from "./SimilarListings";

interface Props {
  listing: Listing;
  allListings: Listing[];
  isComparing: boolean;
  compareCount: number;
  onToggleCompare: () => void;
}

export default function ListingCard({ listing: l, allListings, isComparing, compareCount, onToggleCompare }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const vehicleName = [l.year, l.make, l.model, l.trim].filter(Boolean).join(" ") || l.title;

  // Feature 1: price delta chip
  const priceDeltaChip = (() => {
    if (l.price_delta_pct === null || l.price_delta_pct === undefined) return null;
    const pct = l.price_delta_pct;
    const abs = Math.abs(pct);
    const dollars = l.market_price_estimate
      ? Math.abs(Math.round((l.price ?? 0) - l.market_price_estimate))
      : null;

    if (pct < -3) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5">
          <TrendingDown className="w-3 h-3" />
          {dollars ? `$${dollars.toLocaleString()} below market` : `${abs.toFixed(0)}% below`}
        </span>
      );
    }
    if (pct > 3) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5">
          <TrendingUp className="w-3 h-3" />
          {dollars ? `$${dollars.toLocaleString()} above market` : `${abs.toFixed(0)}% above`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">
        <Minus className="w-3 h-3" />
        Near market price
      </span>
    );
  })();

  // Feature 18: Export/print
  const handlePrint = () => {
    document.title = vehicleName;
    window.print();
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border overflow-hidden transition-all duration-200 print-target ${
        isComparing
          ? "border-violet-400 dark:border-violet-600 shadow-lg shadow-violet-100 dark:shadow-violet-900/20"
          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-slate-900/60"
      }`}
    >
      {/* Image area */}
      <div className="relative h-52 bg-slate-100 dark:bg-slate-800 overflow-hidden">
        {l.images.length > 0 && !imgError ? (
          <img
            src={l.images[0]}
            alt={vehicleName}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Car className="w-12 h-12 text-slate-300 dark:text-slate-600" />
            <span className="text-xs text-slate-400 dark:text-slate-500">No image</span>
          </div>
        )}

        {/* Gradient overlay for bottom badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Seller type badge — top left */}
        <span className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
          l.seller_type === "dealer"
            ? "bg-blue-600/90 text-white"
            : l.seller_type === "private"
            ? "bg-slate-800/80 text-white"
            : "bg-slate-600/80 text-white"
        }`}>
          {l.seller_type === "dealer" ? "Dealer" : l.seller_type === "private" ? "Private" : "Unknown"}
        </span>

        {/* Feature 13: Deal score badge — top right */}
        <div className="absolute top-2 right-2">
          <DealScoreBadge score={l.quick_score} />
        </div>

        {/* Price — bottom left overlay */}
        <div className="absolute bottom-2 left-2">
          <span className="text-white font-bold text-xl drop-shadow-md">
            {l.price ? `$${l.price.toLocaleString()}` : "—"}
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-snug line-clamp-2 mb-2">
          {vehicleName}
        </h3>

        {/* Market delta chip */}
        {priceDeltaChip && <div className="mb-2">{priceDeltaChip}</div>}

        {/* Key stats */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
          {l.mileage && (
            <span className="flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              {l.mileage.toLocaleString()} mi
            </span>
          )}
          {l.year && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {l.year}
            </span>
          )}
          {l.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {l.location}
            </span>
          )}
          {l.seller_name && (
            <span className="flex items-center gap-1">
              {l.seller_type === "dealer" ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
              {l.seller_name}
            </span>
          )}
        </div>

        {/* History badges */}
        <HistoryBadges vin={l.vin} history={l.history} compact />

        {/* VIN */}
        {l.vin && (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 font-mono">VIN: {l.vin}</p>
        )}

        {/* Action row */}
        <div className="mt-3 flex gap-2 no-print">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex-1 flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Less" : "Details & AI"}
          </button>

          {/* Feature 14: Compare button */}
          <button
            onClick={onToggleCompare}
            disabled={!isComparing && compareCount >= 4}
            title={compareCount >= 4 && !isComparing ? "Max 4 vehicles" : isComparing ? "Remove from compare" : "Add to compare"}
            className={`flex items-center justify-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              isComparing
                ? "bg-violet-600 text-white border-violet-600"
                : compareCount >= 4
                ? "text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                : "text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-300 hover:text-violet-600 dark:hover:text-violet-400"
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Expanded section */}
        {expanded && (
          <div className="mt-4 space-y-4">

            {/* Print vehicle header (print-only) */}
            <div className="print-vehicle-header hidden print:block">
              {vehicleName} {l.vin ? `— VIN: ${l.vin}` : ""}
            </div>

            {/* Description */}
            {l.description && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Description</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line line-clamp-6">{l.description}</p>
              </div>
            )}

            {/* Decoded VIN details */}
            {l.decoded_vin && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Vehicle Specs</h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {[
                    ["Engine", l.decoded_vin.engine ? `${l.decoded_vin.engine}L` : null],
                    ["Transmission", l.decoded_vin.transmission],
                    ["Drive", l.decoded_vin.drive_type],
                    ["Body", l.decoded_vin.body_style],
                    ["Built in", l.decoded_vin.plant_country],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k as string} className="flex gap-1">
                      <dt className="text-slate-400 dark:text-slate-500">{k}:</dt>
                      <dd className="text-slate-700 dark:text-slate-300">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* History detail */}
            {l.history && (
              <div className="analysis-section">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Vehicle History</h4>
                <HistoryBadges vin={l.vin} history={l.history} />
                {l.history.recalls.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {l.history.recalls.slice(0, 3).map((r) => (
                      <div key={r.recall_id} className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-lg p-2">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">{r.component}</span>
                        <p className="text-amber-600 dark:text-amber-400 mt-0.5">{r.summary.slice(0, 120)}…</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Market price info */}
            {l.market_price_estimate && (
              <div className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Market Price Estimate</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Avg for this year/make/model:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">${l.market_price_estimate.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* External links */}
            <div className="flex flex-wrap gap-2 no-print">
              {isSafeUrl(l.url) && (
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View on Facebook
                </a>
              )}
              {l.carfax_url && isSafeUrl(l.carfax_url) && (
                <a
                  href={l.carfax_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Carfax Report
                </a>
              )}
              {l.autocheck_url && isSafeUrl(l.autocheck_url) && (
                <a
                  href={l.autocheck_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  AutoCheck
                </a>
              )}
              {l.title_check_url && isSafeUrl(l.title_check_url) && (
                <a
                  href={l.title_check_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  State Title Check
                </a>
              )}
            </div>

            {/* Feature 15: Financing calculator */}
            <FinancingCalculator price={l.price} />

            {/* AI Analysis */}
            <AiAnalysisPanel listing={l} />

            {/* Feature 16: Similar listings */}
            <SimilarListings listing={l} allListings={allListings} />

            {/* Feature 18: Export/print button */}
            <button
              onClick={handlePrint}
              className="no-print w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5" />
              Export / Print Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
