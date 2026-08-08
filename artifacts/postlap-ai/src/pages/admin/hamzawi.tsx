import {
  Loader2, ShieldAlert, Users, UserCheck, CheckCircle, Activity,
  MessageSquare, Image as ImageIcon, FileText, AlertTriangle, BarChart3,
} from "lucide-react";
import { ADMIN_TOKEN_KEY, PLAN_LABEL } from "@/lib/admin-shared";
import { useOwnerInsights } from "@/hooks/useOwnerInsights";

export default function Hamzawi() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const { insights, loading } = useOwnerInsights(token);

  return (
    <section className="bg-card border border-primary/20 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-foreground flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-primary" />
          Hamzawi — مساعد المالك
        </h2>
        <span className="text-[11px] text-muted-foreground border border-border rounded-full px-2 py-0.5">
          قراءة فقط — بيانات المنصة
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : insights ? (
        <>
          {/* KPI chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <Users className="w-4 h-4 text-primary" />, label: "إجمالي المستخدمين", value: insights.users.total },
              { icon: <UserCheck className="w-4 h-4 text-green-400" />, label: "مشتركون مدفوعون", value: insights.users.paid_subscribers },
              { icon: <CheckCircle className="w-4 h-4 text-green-400" />, label: "فحوصات اليوم", value: insights.checks.today },
              { icon: <Activity className="w-4 h-4 text-primary" />, label: "مستخدمون جدد (7 أيام)", value: insights.users.new_7d },
              { icon: <MessageSquare className="w-4 h-4 text-primary" />, label: "المحادثات", value: insights.conversations.total },
              { icon: <FileText className="w-4 h-4 text-primary" />, label: "الرسائل", value: insights.messages.total },
              { icon: <ImageIcon className="w-4 h-4 text-primary" />, label: "أصول وسائط", value: insights.media.total },
              { icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />, label: "اشتراكات تنتهي قريباً", value: insights.users.expiring_7d },
            ].map((s) => (
              <div key={s.label} className="bg-background border border-border rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">{s.icon}</div>
                <div className="min-w-0">
                  <p className="text-xl font-black text-foreground leading-tight">{s.value.toLocaleString("ar")}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {/* Users by plan */}
            <div className="bg-background border border-border rounded-xl p-4 space-y-2">
              <p className="font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> توزيع الخطط
              </p>
              {Object.keys(insights.users.by_plan).length === 0 ? (
                <p className="text-xs text-muted-foreground">لا يوجد مستخدمون</p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(insights.users.by_plan).map(([plan, n]) => (
                    <div key={plan} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{PLAN_LABEL[plan] ?? plan}</span>
                      <span className="font-bold text-foreground">{n.toLocaleString("ar")}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="pt-1 text-xs text-muted-foreground border-t border-border/40">
                نشط: {insights.users.active.toLocaleString("ar")} · موقوف: {insights.users.inactive.toLocaleString("ar")} · أكملوا الهوية: {insights.users.brand_onboarded.toLocaleString("ar")}
              </p>
            </div>

            {/* Checks summary */}
            <div className="bg-background border border-border rounded-xl p-4 space-y-2">
              <p className="font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> نتائج فحص الإعلانات
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">مقبول (ممتاز)</span>
                  <span className="font-bold text-green-400">{insights.checks.approved.toLocaleString("ar")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">مرفوض</span>
                  <span className="font-bold text-red-400">{insights.checks.rejected.toLocaleString("ar")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">من زوار غير مسجلين</span>
                  <span className="font-bold text-foreground">{insights.checks.guest.toLocaleString("ar")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">متوسط الدرجات</span>
                  <span className="font-bold text-foreground">{insights.checks.avg_score ?? "—"}</span>
                </div>
              </div>
              <p className="pt-1 text-xs text-muted-foreground border-t border-border/40">
                إجمالي الفحوصات: {insights.checks.total.toLocaleString("ar")} · اليوم: {insights.checks.today.toLocaleString("ar")}
              </p>
            </div>
          </div>

          {/* Detected problems / recommendations */}
          <div className="space-y-2">
            <p className="font-bold text-foreground text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" /> ملاحظات وتوصيات
            </p>
            <ul className="space-y-1.5">
              {insights.problems.map((p, i) => (
                <li
                  key={i}
                  className={`text-sm flex items-start gap-2 rounded-lg px-3 py-2 border ${
                    p.severity === "high"
                      ? "border-red-400/30 bg-red-400/5 text-red-300"
                      : p.severity === "medium"
                        ? "border-yellow-400/30 bg-yellow-400/5 text-yellow-200"
                        : "border-border bg-muted/20 text-muted-foreground"
                  }`}
                >
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${p.severity === "high" ? "text-red-400" : p.severity === "medium" ? "text-yellow-400" : "text-muted-foreground"}`} />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Expiring soon list */}
          {insights.users.expiring_list.length > 0 && (
            <div className="space-y-2">
              <p className="font-bold text-foreground text-sm">اشتراكات تنتهي خلال 7 أيام</p>
              <ul className="space-y-1">
                {insights.users.expiring_list.map((u) => (
                  <li key={u.email} className="text-xs text-muted-foreground flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2">
                    <span dir="ltr">{u.email}</span>
                    <span>{u.expires_at ? new Date(u.expires_at).toLocaleDateString("ar") : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
