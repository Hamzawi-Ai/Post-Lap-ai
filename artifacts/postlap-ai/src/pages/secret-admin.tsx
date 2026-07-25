import { useState, useEffect } from "react";
import { Shield, Search, CheckCircle, XCircle, Loader2, LogOut, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SECRET_ADMIN_TOKEN_KEY = "postlap_secret_admin_token";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  is_active: boolean;
  trials_remaining: number;
  total_checks: number;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = {
  visitor: "زائر",
  registered: "مسجل",
  professional: "Smart Fix",
  smart_fix: "Smart Fix",
  content: "إدارة المحتوى",
  agency: "وكالة",
};

const PLAN_COLORS: Record<string, string> = {
  visitor: "text-muted-foreground border-border",
  registered: "text-yellow-400 border-yellow-400/40",
  professional: "text-primary border-primary/50",
  smart_fix: "text-primary border-primary/50",
  content: "text-green-400 border-green-400/40",
  agency: "text-purple-400 border-purple-400/40",
};

export default function SecretAdmin() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(SECRET_ADMIN_TOKEN_KEY));
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [byEmailInput, setByEmailInput] = useState("");
  const [byEmailPlan, setByEmailPlan] = useState("smart_fix");
  const [byEmailLoading, setByEmailLoading] = useState(false);

  async function login() {
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem(SECRET_ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(SECRET_ADMIN_TOKEN_KEY);
    setToken(null);
    setUsers([]);
  }

  async function fetchUsers() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      setUsers(data);
    } catch {
      toast({ title: "خطأ في جلب المستخدمين", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (token) fetchUsers(); }, [token]);

  async function upgradePlan(userId: number, plan: string) {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/upgrade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, plan: data.plan } : u));
      toast({ title: "تم تحديث الخطة", description: `${data.email} → ${PLAN_LABELS[data.plan]}` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  }

  async function toggleActive(userId: number, email: string, active: boolean) {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/activate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: data.is_active } : u));
      toast({ title: active ? "تم التفعيل" : "تم التعطيل", description: email });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  }

  async function setPlanByEmail() {
    if (!token || !byEmailInput.trim()) return;
    setByEmailLoading(true);
    try {
      const res = await fetch("/api/admin/set-plan-by-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: byEmailInput.trim(), plan: byEmailPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "✅ تم تعيين الخطة", description: `${data.email} → ${PLAN_LABELS[data.plan]}` });
      setByEmailInput("");
      fetchUsers();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setByEmailLoading(false);
    }
  }

  const filtered = users.filter(
    (u) => u.email.toLowerCase().includes(search.toLowerCase()) || u.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-black text-foreground">لوحة المالك</h1>
            <p className="text-xs text-muted-foreground">وصول مقيّد — للإدارة فقط</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              placeholder="كلمة السر"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-right"
            />
            <button
              onClick={login}
              disabled={loginLoading || !password}
              className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              دخول
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-border bg-black/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-black text-foreground">لوحة المالك — PostLapAI</span>
          <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">سري</span>
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="w-3.5 h-3.5" />
          خروج
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Quick set plan by email */}
        <section className="bg-card border border-primary/20 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-black text-foreground flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            تعيين خطة بالبريد الإلكتروني
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="email@example.com"
              value={byEmailInput}
              onChange={(e) => setByEmailInput(e.target.value)}
              dir="ltr"
              className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
            />
            <select
              value={byEmailPlan}
              onChange={(e) => setByEmailPlan(e.target.value as any)}
              className="bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="agency">وكالة</option>
              <option value="content">إدارة المحتوى</option>
              <option value="smart_fix">Smart Fix</option>
              <option value="professional">Smart Fix (قديم)</option>
              <option value="registered">مسجل</option>
              <option value="visitor">زائر</option>
            </select>
            <button
              onClick={setPlanByEmail}
              disabled={byEmailLoading || !byEmailInput.trim()}
              className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 shrink-0"
            >
              {byEmailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              تعيين
            </button>
          </div>
        </section>

        {/* Users list */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-base font-black text-foreground">
              المستخدمون <span className="text-muted-foreground font-normal text-sm">({users.length})</span>
            </h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="بحث بالاسم أو البريد..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-right"
                />
              </div>
              <button
                onClick={fetchUsers}
                disabled={loading}
                className="bg-card border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تحديث"}
              </button>
            </div>
          </div>

          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((u) => (
                <div key={u.id} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground text-sm truncate">{u.name || "—"}</p>
                      <span className={`text-xs border px-2 py-0.5 rounded-full ${PLAN_COLORS[u.plan] ?? "text-muted-foreground border-border"}`}>
                        {PLAN_LABELS[u.plan] ?? u.plan}
                      </span>
                      {!u.is_active && (
                        <span className="text-xs border border-red-400/40 text-red-400 px-2 py-0.5 rounded-full">معطّل</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{u.email}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      فحوصات: {u.total_checks} · متبقي: {u.trials_remaining}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <select
                      value={u.plan}
                      onChange={(e) => upgradePlan(u.id, e.target.value)}
                      className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      <option value="agency">وكالة</option>
                      <option value="content">إدارة المحتوى</option>
                      <option value="smart_fix">Smart Fix</option>
                      <option value="professional">Smart Fix (قديم)</option>
                      <option value="registered">مسجل</option>
                      <option value="visitor">زائر</option>
                    </select>
                    <button
                      onClick={() => toggleActive(u.id, u.email, !u.is_active)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${
                        u.is_active
                          ? "border-red-400/30 text-red-400 hover:bg-red-400/10"
                          : "border-green-400/30 text-green-400 hover:bg-green-400/10"
                      }`}
                    >
                      {u.is_active ? <><XCircle className="w-3 h-3" /> تعطيل</> : <><CheckCircle className="w-3 h-3" /> تفعيل</>}
                    </button>
                    <button
                      onClick={async () => {
                        if (!token) return;
                        try {
                          await fetch(`/api/admin/users/${u.id}/unlimited`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          toast({ title: "✅ تم منح استخدام غير محدود", description: u.email });
                          fetchUsers();
                        } catch {
                          toast({ title: "خطأ", variant: "destructive" });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-purple-400/30 text-purple-400 hover:bg-purple-400/10 transition-colors"
                      title={u.trials_remaining >= 99999 ? "استخدام غير محدود" : "منح استخدام غير محدود"}
                    >
                      ∞
                    </button>
                    <button
                      onClick={async () => {
                        if (!token) return;
                        try {
                          await fetch(`/api/admin/users/${u.id}/reset-limits`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          toast({ title: "✅ تم إعادة تعيين الحدود اليومية", description: u.email });
                          fetchUsers();
                        } catch {
                          toast({ title: "خطأ", variant: "destructive" });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                      title="إعادة تعيين الحدود اليومية"
                    >
                      ↻
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-12">لا يوجد مستخدمون مطابقون</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
