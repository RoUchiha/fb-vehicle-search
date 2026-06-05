import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, HelpCircle } from "lucide-react";
import type { VehicleHistory } from "../types";

interface Props {
  vin: string | null;
  history: VehicleHistory | null;
  compact?: boolean;
}

export default function HistoryBadges({ vin, history, compact = false }: Props) {
  if (!vin) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
        <HelpCircle className="w-3 h-3" /> No VIN
      </span>
    );
  }

  if (!history) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
        <HelpCircle className="w-3 h-3" /> History loading…
      </span>
    );
  }

  const nicbFlag = history.nicb_stolen || history.nicb_salvage;
  const hasOpenRecalls = history.open_recall_count > 0;
  const hasRecalls = history.recall_count > 0;

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-1"}`}>
      {/* NICB flag — highest severity */}
      {nicbFlag && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-xs font-medium">
          <ShieldX className="w-3 h-3" />
          {history.nicb_stolen ? "Stolen Flag" : "Salvage Flag"}
        </span>
      )}

      {/* Recalls */}
      {hasOpenRecalls ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-medium">
          <AlertTriangle className="w-3 h-3" />
          {history.open_recall_count} Open {history.open_recall_count === 1 ? "Recall" : "Recalls"}
        </span>
      ) : hasRecalls ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 text-xs font-medium">
          <ShieldAlert className="w-3 h-3" />
          {history.recall_count} {history.recall_count === 1 ? "Recall" : "Recalls"}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
          <ShieldCheck className="w-3 h-3" />
          0 Recalls
        </span>
      )}

      {/* Complaints */}
      {!compact && history.complaint_count > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs">
          {history.complaint_count} Complaints
        </span>
      )}
    </div>
  );
}
