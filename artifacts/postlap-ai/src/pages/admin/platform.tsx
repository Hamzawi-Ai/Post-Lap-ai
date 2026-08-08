import { useEffect, useState } from "react";
import { Server, ShieldCheck, XCircle, Loader2 } from "lucide-react";

export default function Platform() {
  const [health, setHealth] = useState<"ok" | "down" | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/healthz");
        if (!cancelled) setHealth(res.ok ? "ok" : "down");
      } catch {
        if (!cancelled) setHealth("down");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <h2 className="font-black text-foreground flex items-center gap-2">
        <Server className="w-5 h-5 text-primary" />
        حالة المنصة
      </h2>
      <div className="flex items-center gap-3">
        {health === "checking" ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : health === "ok" ? (
          <ShieldCheck className="w-5 h-5 text-green-400" />
        ) : (
          <XCircle className="w-5 h-5 text-red-400" />
        )}
        <span className="text-sm text-muted-foreground">
          {health === "ok" ? "جميع الأنظمة تعمل بشكل طبيعي" : health === "down" ? "المنصة غير متاحة" : "جارٍ الفحص..."}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        نقطة النهاية: <span dir="ltr">GET /api/healthz</span>
      </p>
    </section>
  );
}
