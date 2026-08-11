import { Loader2, CreditCard, AlertTriangle, Users as UsersIcon, ShieldCheck } from "lucide-react";
import { ADMIN_TOKEN_KEY, PLAN_LABEL, expiryBadge } from "@/lib/admin-shared";
import { useOwnerInsights } from "@/hooks/useOwnerInsights";
import { useAdminUsers } from "@/hooks/useAdminUsers";

export default function Subscriptions() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const { insights, loading } = useOwnerInsights(token);
  const { users, usersLoading } = useAdminUsers(token);

  const paidUsers = users.filter((u) => u.plan === "pro");

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Subscription KPIs */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: <CreditCard className="w-5 h-5 text-primary" />, label: "مشتركون مدفوعون", value: insights?.users.paid_subscribers ?? 0 },
              { icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />, label: "تنتهي خلال 7 أيام", value: insights?.users.expiring_7d ?? 0 },
              { icon: <AlertTriangle className="w-5 h-5 text-red-400" />, label: "اشتراكات منتهية", value: insights?.users.expired ?? 0 },
              { icon: <UsersIcon className="w-5 h-5 text-primary" />, label: "إجمالي المستخدمين", value: insights?.users.total ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">{s.icon}</div>
                <p className="text-2xl font-black text-foreground">{s.value.toLocaleString("ar")}</p>
                <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan distribution */}
            <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
              <h2 className="font-black text-foreground flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-primary" />
                توزيع الخطط
              </h2>
              {Object.keys(insights?.users.by_plan ?? {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">لا يوجد مستخدمون</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(insights?.users.by_plan ?? {}).map(([plan, n]) => (
                    <div key={plan} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{PLAN_LABEL[plan] ?? plan}</span>
                      <span className="font-bold text-foreground">{n.toLocaleString("ar")}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Expiring soon */}
            <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
              <h2 className="font-black text-foreground flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                اشتراكات تنتهي خلال 7 أيام
              </h2>
              {(insights?.users.expiring_list ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد اشتراكات تنتهي قريباً</p>
              ) : (
                <ul className="space-y-1.5">
                  {insights?.users.expiring_list.map((u) => (
                    <li key={u.email} className="text-xs text-muted-foreground flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2">
                      <span dir="ltr">{u.email}</span>
                      <span>{u.expires_at ? new Date(u.expires_at).toLocaleDateString("ar") : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Paid users table */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              <h2 className="font-bold text-foreground">المشتركون المدفوعون</h2>
              <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">{paidUsers.length}</span>
            </div>
            {usersLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-3 text-right font-semibold">المستخدم</th>
                      <th className="px-4 py-3 text-right font-semibold">الخطة</th>
                      <th className="px-4 py-3 text-right font-semibold">انتهاء الاشتراك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidUsers.length === 0 ? (
                      <tr><td colSpan={3} className="text-center text-muted-foreground py-12 text-sm">لا يوجد مشتركون بعد</td></tr>
                    ) : paidUsers.map((u) => (
                      <tr key={u.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground text-sm">{u.name || "—"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary bg-primary/10">
                            {u.subscription_label ?? PLAN_LABEL[u.plan] ?? u.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3">{expiryBadge(u.subscription_expires_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
