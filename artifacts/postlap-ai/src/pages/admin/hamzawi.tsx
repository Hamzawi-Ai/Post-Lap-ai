import { useState, useEffect, useCallback } from "react";
import { Menu, Loader2, ShieldAlert, Users, UserCheck, CheckCircle, Activity, MessageSquare, Image as ImageIcon, FileText, AlertTriangle, BarChart3 } from "lucide-react";
import { useGetConfig, getGetConfigQueryKey } from "@workspace/api-client-react";
import { ADMIN_TOKEN_KEY, PLAN_LABEL } from "@/lib/admin-shared";
import { useOwnerInsights } from "@/hooks/useOwnerInsights";
import HamzawiChat from "@/components/HamzawiChat";
import HamzawiSidebar, { type Conversation } from "@/components/HamzawiSidebar";

const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";
const GENDER_KEY = "postlap_gender";

interface LocalUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  gender: string | null;
  is_active: boolean;
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredUser(): LocalUser | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "null"); } catch { return null; }
}

export default function Hamzawi() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const { insights, loading: insightsLoading } = useOwnerInsights(token);

  const { data: config } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });

  const [user, setUser] = useState<LocalUser | null>(getStoredUser);
  const isAuthenticated = !!user && !!getToken();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const whatsapp = config?.whatsapp ?? "218915811115";
  const gender = (user?.gender ?? localStorage.getItem(GENDER_KEY) ?? null) as "male" | "female" | null;

  // Issue 4 isolation: scope the workspace to the authenticated identity and
  // invalidate it whenever the identity changes (same-tab login/logout, account
  // switch, or a cross-tab storage change re-synced below). Keeps the existing
  // owner/control-panel behavior — only the identity source becomes reactive.
  const currentUserId = user?.id ?? null;

  useEffect(() => {
    setConversations([]);
    setActiveConversationId(null);
  }, [currentUserId]);

  // Cross-tab account switching (Issue 4): the browser `storage` event fires in
  // OTHER tabs when postlap_token/postlap_user changes in this browser. Re-read
  // the stored auth state and re-sync the React user so the currentUserId
  // effects above invalidate the stale workspace and refetch for the new
  // identity. The tab that made the change is handled by the existing same-tab
  // login/logout flow — the storage event does not fire there, so no loop.
  useEffect(() => {
    function onAuthStorageChange(e: StorageEvent) {
      if (e.key !== TOKEN_KEY && e.key !== USER_KEY) return;
      setUser(getStoredUser());
    }
    window.addEventListener("storage", onAuthStorageChange);
    return () => window.removeEventListener("storage", onAuthStorageChange);
  }, []);

  // Fetch conversation list — only when authenticated, no polling.
  const fetchConversations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/hamzawi/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      console.error("Failed to fetch conversations");
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Fetch the current identity's conversations whenever the identity changes.
  useEffect(() => {
    if (user && getToken()) {
      fetchConversations();
    }
  }, [currentUserId, fetchConversations]);

  // --- Conversation mutation handlers ---

  function handleSelect(id: string) {
    setActiveConversationId(id);
  }

  function handleNew() {
    setActiveConversationId(null);
  }

  async function handleRename(id: string, title: string) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/hamzawi/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        await fetchConversations();
      }
    } catch {
      console.error("Failed to rename conversation");
    }
  }

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/hamzawi/conversations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // If the deleted conversation was active, reset to new chat.
        if (activeConversationId === id) {
          setActiveConversationId(null);
        }
        await fetchConversations();
      }
    } catch {
      console.error("Failed to delete conversation");
    }
  }

  function handleConversationCreated(id: string) {
    setActiveConversationId(id);
    // Refresh sidebar so the new conversation appears.
    fetchConversations();
  }

  return (
    <div className="space-y-6">
      {/* Insights report */}
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

        {insightsLoading ? (
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

      {/* Chat workspace (moved from standalone /hamzawi) */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <button
            onClick={() => setSidebarVisible(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            aria-label="فتح المحادثات"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary">
              P
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Hamzawi — مساحة المحادثة</p>
              <p className="text-[10px] text-muted-foreground">محادثات المستخدمين عبر المنصة</p>
            </div>
          </div>
          {loadingConversations && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-auto" />
          )}
        </div>
        <div className="flex h-[600px] bg-background overflow-hidden" dir="rtl">
          {isAuthenticated && (
            <HamzawiSidebar
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelect={handleSelect}
              onNew={handleNew}
              onRename={handleRename}
              onDelete={handleDelete}
              visible={sidebarVisible}
              onClose={() => setSidebarVisible(false)}
            />
          )}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <HamzawiChat
              embedded
              gender={gender}
              checkResult={null}
              whatsapp={whatsapp}
              userPlan={user?.plan}
              conversationId={activeConversationId}
              onConversationCreated={handleConversationCreated}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
