import { useState, useMemo } from "react";
import { Calculator, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  price: number | null;
}

const TERMS = [36, 48, 60, 72];

export default function FinancingCalculator({ price }: Props) {
  const [open, setOpen] = useState(false);
  const [downPayment, setDownPayment] = useState(price ? Math.round(price * 0.1) : 0);
  const [rate, setRate] = useState(7.5);
  const [term, setTerm] = useState(60);

  const calc = useMemo(() => {
    if (!price) return null;
    const principal = Math.max(0, price - downPayment);
    if (principal === 0) return { monthly: 0, totalInterest: 0, totalCost: price };
    const monthlyRate = rate / 100 / 12;
    if (monthlyRate === 0) {
      const monthly = principal / term;
      return { monthly, totalInterest: 0, totalCost: price };
    }
    const monthly = (principal * monthlyRate * Math.pow(1 + monthlyRate, term)) /
                    (Math.pow(1 + monthlyRate, term) - 1);
    const totalPaid = monthly * term;
    const totalInterest = totalPaid - principal;
    return {
      monthly,
      totalInterest,
      totalCost: downPayment + totalPaid,
    };
  }, [price, downPayment, rate, term]);

  if (!price) return null;

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden no-print">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Calculator className="w-4 h-4 text-indigo-500" />
          Financing Calculator
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white dark:bg-slate-900">
          {/* Down payment */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
              Down Payment
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="number"
                value={downPayment}
                onChange={(e) => setDownPayment(Math.max(0, Math.min(price, parseInt(e.target.value) || 0)))}
                className="w-full pl-7 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Interest rate */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
              Interest Rate (APR)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="30"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                className="w-full pr-8 pl-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
            </div>
          </div>

          {/* Loan term */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
              Loan Term
            </label>
            <div className="flex gap-1.5">
              {TERMS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTerm(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    term === t
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                  }`}
                >
                  {t}mo
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          {calc && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">Monthly Payment</span>
                <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{fmt(calc.monthly)}<span className="text-sm font-normal">/mo</span></span>
              </div>
              <div className="border-t border-indigo-100 dark:border-indigo-800 pt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Total Interest</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{fmt(calc.totalInterest)}</p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Total Cost</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{fmt(calc.totalCost)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
