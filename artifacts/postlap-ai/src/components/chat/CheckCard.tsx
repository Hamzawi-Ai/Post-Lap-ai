import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import type { ChatRenderer } from "./rendererRegistry";
import type { CheckResultBlock } from "@/lib/messages/types";

const labels = {
  ar: { score: "النقاط:", violations: "المخالفات", suggestions: "الاقتراحات" },
  en: { score: "Score:", violations: "Violations", suggestions: "Suggestions" },
} as const;

/**
 * Ad-check result card, mirroring the homepage inline result layout.
 *
 * Registered in UX-1 but NOT emitted yet: check-in-chat activates later, when
 * the backend starts routing check results as chat blocks (P2 / TOOL_RESULT).
 */
const CheckCard: ChatRenderer = ({ block, ctx }) => {
  const m = block as CheckResultBlock;
  const result = m.result;
  const l = labels[ctx.lang];

  const headerBg =
    result.status === "ممتاز"
      ? "bg-green-500/10"
      : result.status === "مرفوض"
        ? "bg-red-500/10"
        : "bg-yellow-500/10";
  const Icon =
    result.status === "ممتاز"
      ? CheckCircle
      : result.status === "مرفوض"
        ? XCircle
        : AlertCircle;
  const iconClass =
    result.status === "ممتاز"
      ? "text-green-400"
      : result.status === "مرفوض"
        ? "text-red-400"
        : "text-yellow-400";

  return (
    <div className="bg-card border-b border-border">
      <div className={`p-4 border-b border-border flex items-center justify-between gap-3 ${headerBg}`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconClass}`} />
          <p className="font-bold text-foreground">{result.status}</p>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">{l.score}</span>{" "}
          <span className="font-black text-primary text-lg">{result.score}</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {result.message && (
          <p className="text-xs text-foreground leading-relaxed">{result.message}</p>
        )}
        {result.violations && result.violations.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-muted-foreground mb-1.5">{l.violations}</p>
            <ul className="space-y-1.5">
              {result.violations.map((v, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
                  <span>{v.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.suggestions && result.suggestions.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-muted-foreground mb-1.5">{l.suggestions}</p>
            <ul className="space-y-1.5">
              {result.suggestions.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-400" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckCard;
