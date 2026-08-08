import { useEffect, useState } from "react";
import {
  Loader2, Users, UserCheck, Activity, CheckCircle, CreditCard,
  MessageSquare, FileText, Image as ImageIcon, Server, ShieldCheck,
  AlertTriangle, UserPlus,
} from "lucide-react";
import { ADMIN_TOKEN_KEY, PAID_PLANS, PLAN_LABEL } from "@/lib/admin-shared";
import { useOwnerInsights } from "@/hooks/useOwnerInsights";
import { useAdminUsers } from "@/hooks/useAdminUsers";

export default function Dashboard() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const { insights, loading } = useOwnerInsights(token);
  const { users } = useAdminUsers(token);
  const [health, setHealth] = useState<"ok" | "down" | null>(null);

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

  const recentUsers = [...users]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const generatedImages = insights?.media.by_category.generated ?? 0;

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Executive widgets */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { icon: <Users className="w-5 h-5 text-primary" />, label: "إجمالي المستخدمين", value: insights?.users.total ?? 0 },
              { icon: <UserCheck className="w-5 h-5 text-green-400" />, label: "مستخدمون نشطون", value: insights?.users.active ?? 0 },
              { icon: <Activity className="w-5 h-5 text-primary" />, label: "مستخدمون جدد (7 أيام)", value: insights?.users.new_7d ?? 0 },
              { icon: <CheckCircle className="w-5 h-5 text-green-400" />, label: "فحوصات اليوم", value: insights?.checks.today ?? 0 },
              { icon: <FileText className="w-5 h-5 text-primary" />, label: "إجمالي الفحوصات", value: insights?.checks.total ?? 0 },
              { icon: <CreditCard className="w-5 h-5 text-green-400" />, label: "مشتركون مدفوعون", value: insights?.users.paid_subscribers ?? 0 },
              { icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />, label: "اشتراكات تنتهي قريباً", value: insights?.users.expiring_7d ?? 0 },
              { icon: <MessageSquare className="w-5 h-5 text-primary" />, label: "المحادثات", value: insights?.conversations.total ?? 0 },
              { icon: <FileText className="w-5 h-5 text-primary" />, label: "الرسائل", value: insights?.messages.total ?? 0 },
              { icon: <ImageIcon className="w-5 h-5 text-primary" />, label: "أصول وسائط", value: insights?.media.total ?? 0 },
              { icon: <ImageIcon className="w-5 h-5 text-purple-400" />, label: "صور مولّدة (إجمالي)", value: generatedImages },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">{s.icon}</div>
                <p className="text-2xl font-black text-foreground">{s.value.toLocaleString("ar")}</p>
                <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Platform status */}
            <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-black text-foreground flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                حالة المنصة
              </h2>
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-5 h-5 ${health === "ok" ? "text-green-400" : health === "down" ? "text-red-400" : "text-muted-foreground"}`} />
                <span className="text-sm text-muted-foreground">
                  {health === "ok" ? "جميع الأنظمة تعمل بشكل طبيعي" : health === "down" ? "المنصة غير متاحة" : "جارٍ الفحص..."}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                مقبول: {insights?.checks.approved ?? 0} · مرفوض: {insights?.checks.rejected ?? 0} · متوسط الدرجات: {insights?.checks.avg_score ?? "—"}
              </p>
            </section>

            {/* Latest activity */}
            <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-black text-foreground flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                آخر النشاطات
              </h2>
              {recentUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا يوجد نشاط بعد</p>
              ) : (
                <ul className="space-y-3">
                  {recentUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{u.name || u.email}</p>
                        <p className="text-xs text-muted-foreground truncate" dir="ltr">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground border border-border rounded-full px-2 py-0.5">
                          {PLAN_LABEL[u.plan] ?? u.plan}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("ar")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
