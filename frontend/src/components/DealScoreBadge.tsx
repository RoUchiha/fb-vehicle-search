
interface Props {
  score: number | null;
  large?: boolean;
}

export default function DealScoreBadge({ score, large = false }: Props) {
  if (score === null || score === undefined) return null;

  const color =
    score >= 70
      ? { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-400", label: "Good Deal" }
      : score >= 40
      ? { bg: "bg-amber-400", text: "text-white", ring: "ring-amber-300", label: "Fair Deal" }
      : { bg: "bg-red-500", text: "text-white", ring: "ring-red-400", label: "Risky" };

  if (large) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-full ${color.bg} ring-2 ${color.ring} w-16 h-16 shadow-lg`}>
        <span className={`font-black text-xl leading-none ${color.text}`}>{score}</span>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${color.text} opacity-90`}>Score</span>
      </div>
    );
  }

  return (
    <div
      title={`Deal Score: ${score}/100 — ${color.label}`}
      className={`flex flex-col items-center justify-center rounded-full ${color.bg} ring-2 ${color.ring} w-10 h-10 shadow-md cursor-default`}
    >
      <span className={`font-black text-sm leading-none ${color.text}`}>{score}</span>
    </div>
  );
}
