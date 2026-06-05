import { Search, MapPin, RotateCcw, BookmarkCheck } from "lucide-react";
import type { SearchParams } from "../types";

const MAKES = [
  "Acura","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge",
  "Ford","GMC","Honda","Hyundai","Infiniti","Jeep","Kia","Lexus","Lincoln",
  "Mazda","Mercedes-Benz","Mitsubishi","Nissan","Pontiac","Ram","Subaru",
  "Tesla","Toyota","Volkswagen","Volvo",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) => CURRENT_YEAR - i);

const MILEAGE_OPTIONS = [
  { label: "Any mileage", value: "" },
  { label: "Under 50,000", value: "50000" },
  { label: "Under 75,000", value: "75000" },
  { label: "Under 100,000", value: "100000" },
  { label: "Under 125,000", value: "125000" },
  { label: "Under 150,000", value: "150000" },
  { label: "Under 200,000", value: "200000" },
];

const RADIUS_OPTIONS = [10, 25, 50, 100, 200, 500];

interface Props {
  params: SearchParams;
  onChange: (p: SearchParams) => void;
  onSearch: () => void;
  onSaveSearch: () => void;
  loading: boolean;
}

const inputClass =
  "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-colors";

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider";

export default function SearchForm({ params, onChange, onSearch, onSaveSearch, loading }: Props) {
  const set = (key: keyof SearchParams, value: string | number) =>
    onChange({ ...params, [key]: value });

  return (
    <aside className="w-72 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full overflow-y-auto no-print">
      {/* Section header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm tracking-tight">Search Filters</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Configure and search Marketplace</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Make / Model */}
        <div className="space-y-1.5">
          <label className={labelClass}>Make</label>
          <select
            value={params.make}
            onChange={(e) => set("make", e.target.value)}
            className={inputClass}
          >
            <option value="">Any Make</option>
            {MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Model</label>
          <input
            type="text"
            value={params.model}
            onChange={(e) => set("model", e.target.value)}
            placeholder="e.g. Camry, F-150"
            className={inputClass}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Year Range */}
        <div className="space-y-1.5">
          <label className={labelClass}>Year Range</label>
          <div className="flex gap-2">
            <select
              value={params.year_min}
              onChange={(e) => set("year_min", e.target.value)}
              className={inputClass}
            >
              <option value="">Min</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="self-center text-slate-400 text-sm">–</span>
            <select
              value={params.year_max}
              onChange={(e) => set("year_max", e.target.value)}
              className={inputClass}
            >
              <option value="">Max</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Price Range */}
        <div className="space-y-1.5">
          <label className={labelClass}>Price ($)</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={params.price_min}
              onChange={(e) => set("price_min", e.target.value)}
              placeholder="Min"
              className={inputClass}
            />
            <span className="self-center text-slate-400 text-sm">–</span>
            <input
              type="number"
              value={params.price_max}
              onChange={(e) => set("price_max", e.target.value)}
              placeholder="Max"
              className={inputClass}
            />
          </div>
        </div>

        {/* Max Mileage */}
        <div className="space-y-1.5">
          <label className={labelClass}>Max Mileage</label>
          <select
            value={params.mileage_max}
            onChange={(e) => set("mileage_max", e.target.value)}
            className={inputClass}
          >
            {MILEAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Location */}
        <div className="space-y-1.5">
          <label className={`${labelClass} flex items-center gap-1`}>
            <MapPin className="w-3 h-3" /> ZIP Code
          </label>
          <input
            type="text"
            value={params.zip_code}
            onChange={(e) => set("zip_code", e.target.value)}
            placeholder="ZIP code"
            maxLength={5}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Search Radius</label>
          <select
            value={params.radius_miles}
            onChange={(e) => set("radius_miles", parseInt(e.target.value))}
            className={inputClass}
          >
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} miles</option>)}
          </select>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Transmission */}
        <div className="space-y-1.5">
          <label className={labelClass}>Transmission</label>
          <div className="flex gap-1.5">
            {(["any", "automatic", "manual"] as const).map((t) => (
              <button
                key={t}
                onClick={() => set("transmission", t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  params.transmission === t
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div className="space-y-1.5">
          <label className={labelClass}>Sort By</label>
          <select
            value={params.sort_by}
            onChange={(e) => set("sort_by", e.target.value as SearchParams["sort_by"])}
            className={inputClass}
          >
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="mileage_asc">Mileage: Low to High</option>
            <option value="newest">Newest First</option>
          </select>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            onClick={onSearch}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm shadow-indigo-200 dark:shadow-indigo-900"
          >
            {loading ? (
              <>
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Searching…
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search Marketplace
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() =>
                onChange({
                  make: "", model: "", year_min: "", year_max: "",
                  price_min: "", price_max: "", mileage_max: "",
                  zip_code: "10001", radius_miles: 50,
                  transmission: "any", condition: "any", sort_by: "relevance",
                })
              }
              className="flex-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs py-2 flex items-center justify-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button
              onClick={onSaveSearch}
              className="flex-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 text-xs py-2 flex items-center justify-center gap-1.5 transition-colors border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950"
            >
              <BookmarkCheck className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
