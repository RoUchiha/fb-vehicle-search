import { useState, useCallback } from "react";
import {
  Sparkles, CheckSquare, Square, Copy, Check,
  Wrench, Eye, MessageCircle, AlertTriangle, ShieldAlert,
  DollarSign, FileText, BarChart3,
} from "lucide-react";
import type { Listing, AnalysisResult } from "../types";
import { analyzeListingStream } from "../api";
import RatingBadge from "./RatingBadge";

interface Props {
  listing: Listing;
}

type State = "idle" | "loading" | "streaming" | "done" | "error";
type Tab = "overview" | "issues" | "maintenance" | "inspection" | "questions";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: "issues", label: "Issues", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { id: "maintenance", label: "Maintenance", icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: "inspection", label: "Inspect", icon: <Eye className="w-3.5 h-3.5" /> },
  { id: "questions", label: "Ask Seller", icon: <MessageCircle className="w-3.5 h-3.5" /> },
];

export default function AiAnalysisPanel({ listing }: Props) {
  const [state, setState] = useState<State>("idle");
  const [streamText, setStreamText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const runAnalysis = useCallback(async () => {
    setState("loading");
    setStreamText("");
    setResult(null);
    setError("");
    setChecked(new Set());

    await analyzeListingStream(
      listing,
      (chunk) => {
        setState("streaming");
        setStreamText((prev) => prev + chunk);
      },
      (res) => {
        setResult(res);
        setState("done");
      },
      (msg) => {
        setError(msg);
        setState("error");
      }
    );
  }, [listing]);

  const toggleCheck = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  if (state === "idle") {
    return (
      <button
        onClick={runAnalysis}
        className="no-print w-full mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shadow-indigo-200 dark:shadow-indigo-900"
      >
        <Sparkles className="w-4 h-4" />
        Get AI Analysis
      </button>
    );
  }

  if (state === "loading") {
    return (
      <div className="mt-2 p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center gap-3 text-indigo-700 dark:text-indigo-400">
        <span className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full shrink-0" />
        <span className="text-sm">Analyzing vehicle data…</span>
      </div>
    );
  }

  if (state === "streaming") {
    return (
      <div className="mt-2 p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 text-sm font-medium mb-2">
          <span className="animate-pulse w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
          Analyzing with Claude…
        </div>
        <pre className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono max-h-32 overflow-hidden opacity-60">
          {streamText.slice(-400)}
        </pre>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mt-2 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
        <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        <button onClick={runAnalysis} className="mt-2 text-red-600 dark:text-red-400 text-sm underline">
          Retry
        </button>
      </div>
    );
  }

  if (!result) return null;

  const tabContent: Record<Tab, React.ReactNode> = {
    overview: (
      <div className="space-y-4">
        <RatingBadge
          rating={result.buy_rating}
          score={result.buy_score}
          priceAssessment={result.price_assessment}
        />
        <div className="analysis-section text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {result.reliability_summary}
        </div>
        <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Overall Assessment</p>
          {result.buy_rationale}
        </div>

        {/* Ownership cost */}
        {result.ownership_cost && (
          <div className="analysis-section bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
              Ownership Costs (Est.)
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {result.ownership_cost.annual_maintenance_estimate !== null && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Annual Maintenance</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">${result.ownership_cost.annual_maintenance_estimate.toLocaleString()}/yr</p>
                </div>
              )}
              {result.ownership_cost.fuel_cost_annual_estimate !== null && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Annual Fuel</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">${result.ownership_cost.fuel_cost_annual_estimate.toLocaleString()}/yr</p>
                </div>
              )}
              {result.ownership_cost.insurance_tier && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Insurance Tier</span>
                  <p className={`font-semibold capitalize ${result.ownership_cost.insurance_tier === "high" ? "text-red-600 dark:text-red-400" : result.ownership_cost.insurance_tier === "low" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {result.ownership_cost.insurance_tier}
                  </p>
                </div>
              )}
            </div>
            {result.ownership_cost.common_repair_costs.length > 0 && (
              <div className="mt-2 border-t border-slate-200 dark:border-slate-700 pt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Common Repairs:</span>
                <ul className="mt-1 space-y-0.5">
                  {result.ownership_cost.common_repair_costs.map((r, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex gap-1.5">
                      <span className="text-slate-300 dark:text-slate-600">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Negotiation script */}
        {result.negotiation_script && (
          <div className="analysis-section bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5" />
                Negotiation Script
              </h4>
              <button
                onClick={() => copyText(result.negotiation_script!, "script")}
                className="text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                title="Copy script"
              >
                {copied === "script" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed whitespace-pre-line">{result.negotiation_script}</p>
          </div>
        )}
      </div>
    ),

    issues: (
      <div className="space-y-3 analysis-section">
        {result.recall_warnings.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">
              <ShieldAlert className="w-3.5 h-3.5" /> Open Recall Warnings
            </h4>
            <ul className="space-y-1">
              {result.recall_warnings.map((w, i) => (
                <li key={i} className="text-xs text-red-700 dark:text-red-400 flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Known Pain Points</h4>
          <BulletList items={result.known_pain_points} />
        </div>
      </div>
    ),

    maintenance: (
      <div className="analysis-section">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Maintenance at {listing.mileage?.toLocaleString() ?? "?"} Miles
        </h4>
        <BulletList items={result.maintenance_at_mileage} />
      </div>
    ),

    inspection: (
      <div className="analysis-section">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Inspection Checklist
          <span className="ml-2 text-slate-400 normal-case font-normal">({checked.size}/{result.inspection_checklist.length} checked)</span>
        </h4>
        <ul className="space-y-1.5">
          {result.inspection_checklist.map((item, i) => (
            <li
              key={i}
              onClick={() => toggleCheck(i)}
              className="flex items-start gap-2 cursor-pointer group"
            >
              {checked.has(i) ? (
                <CheckSquare className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
              ) : (
                <Square className="w-4 h-4 mt-0.5 shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-slate-400" />
              )}
              <span className={`text-sm ${checked.has(i) ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-300"}`}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ),

    questions: (
      <div className="analysis-section">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Questions to Ask the Seller</h4>
        <ul className="space-y-2">
          {result.seller_questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2 group">
              <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 leading-snug">{q}</span>
              <button
                onClick={() => copyText(q, `q${i}`)}
                className="shrink-0 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors mt-0.5"
                title="Copy question"
              >
                {copied === `q${i}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ),
  };

  return (
    <div className="mt-2 space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 no-print">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === t.id
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>{tabContent[activeTab]}</div>

      {/* Print: show all sections */}
      <div className="hidden print:block space-y-4">
        <RatingBadge rating={result.buy_rating} score={result.buy_score} priceAssessment={result.price_assessment} />
        <div><b>Reliability:</b> {result.reliability_summary}</div>
        <div><b>Known Issues:</b><BulletList items={result.known_pain_points} /></div>
        <div><b>Maintenance:</b><BulletList items={result.maintenance_at_mileage} /></div>
        <div><b>Inspection:</b><BulletList items={result.inspection_checklist} /></div>
        <div><b>Questions:</b><BulletList items={result.seller_questions} /></div>
        {result.negotiation_script && <div><b>Negotiation Script:</b><p className="text-sm mt-1">{result.negotiation_script}</p></div>}
      </div>

      <button
        onClick={runAnalysis}
        className="no-print w-full text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 text-xs py-1 flex items-center justify-center gap-1.5"
      >
        <Sparkles className="w-3.5 h-3.5" /> Refresh Analysis
      </button>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex gap-2">
          <span className="shrink-0 text-slate-300 dark:text-slate-600 mt-1">•</span>
          {item}
        </li>
      ))}
    </ul>
  );
}
