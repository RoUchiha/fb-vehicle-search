import { ThumbsUp, AlertCircle, ThumbsDown, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Props {
  rating: "BUY" | "CAUTION" | "AVOID";
  score: number;
  priceAssessment: string;
}

const RATING_STYLES = {
  BUY: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
    badge: "bg-emerald-600",
    bar: "bg-emerald-500",
    Icon: ThumbsUp,
  },
  CAUTION: {
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-500",
    bar: "bg-amber-400",
    Icon: AlertCircle,
  },
  AVOID: {
    bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-600",
    bar: "bg-red-500",
    Icon: ThumbsDown,
  },
};

const PRICE_ICONS = {
  underpriced: { Icon: TrendingDown, label: "Underpriced", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" },
  fair: { Icon: Minus, label: "Fair Price", color: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800" },
  overpriced: { Icon: TrendingUp, label: "Overpriced", color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30" },
  unknown: { Icon: Minus, label: "Price N/A", color: "text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800" },
};

export default function RatingBadge({ rating, score, priceAssessment }: Props) {
  const style = RATING_STYLES[rating];
  const { Icon } = style;
  const priceInfo = PRICE_ICONS[priceAssessment as keyof typeof PRICE_ICONS] ?? PRICE_ICONS.unknown;
  const { Icon: PriceIcon } = priceInfo;

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border ${style.bg}`}>
      <div className={`${style.badge} text-white rounded-xl px-4 py-2 flex items-center gap-2 font-bold text-lg shadow-sm`}>
        <Icon className="w-5 h-5" />
        {rating}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-black text-2xl ${style.text}`}>{score}</span>
          <span className={`text-sm ${style.text} opacity-60`}>/10</span>
        </div>
        <div className="flex gap-0.5 mt-1.5">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? style.bar : "bg-slate-200 dark:bg-slate-700"}`}
            />
          ))}
        </div>
      </div>

      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${priceInfo.color}`}>
        <PriceIcon className="w-3.5 h-3.5" />
        {priceInfo.label}
      </span>
    </div>
  );
}
