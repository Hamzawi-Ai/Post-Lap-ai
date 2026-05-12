import { useState } from "react";
import { Loader2, ShieldAlert, Users, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN_KEY = "postlap_admin_token";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  trials_remaining: number;
  total_checks: number;
  last_check_at: string | null;
  created_at: string;
}

export default function Admin() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [upgrading, setUpgrading] = useState<number | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "خطأ", description: data.error, variant: "destructive" }); return; }
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
      loadUsers(data.token);
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  async function loadUsers(t: string) {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) { setToken(null); localStorage.removeItem(ADMIN_TOKEN_KEY); return; }
      setUsers(await res.json());
    } catch {
      toast({ title: "خطأ في تحميل المستخدمين", variant: "destructive" });
    } finally {
      setUsersLoading(false);
    }
  }

  async function upgradeUser(id: number, plan: string) {
    if (!token) return;
    setUpgrading(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/upgrade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) { toast({ title: "خطأ", variant: "destructive" }); return; }
      const updated: AdminUser = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      toast({ title: "تم التحديث", description: `تم تغيير خطة ${updated.name} إلى ${plan}` });
    } catch {
      toast({ title: "خطأ في التحديث", variant: "destructive" });
    } finally {
      setUpgrading(null);
    }
  }

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setUsers([]);
  }

  const planLabel: Record<string, string> = {
    visitor: "زائر",
    registered: "مسجل",
    professional: "احترافي",
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-black text-foreground">لوحة تحكم المدير</h1>
            <p className="text-sm text-muted-foreground text-center">أدخل كلمة السر للوصول</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة السر"
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-right"
              data-testid="input-admin-password"
            />
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              data-testid="button-admin-login"
            >
              {loginLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              دخول
            </button>
          </form>
          <a href="/" className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
            العودة للرئيسية
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* Admin header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-black text-foreground">لوحة تحكم المدير</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadUsers(token)}
            className="text-sm text-primary hover:underline"
            data-testid="button-refresh-users"
          >
            تحديث
          </button>
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-admin-logout"
          >
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-primary">{users.length}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي المستخدمين</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-primary">{users.filter((u) => u.plan === "professional").length}</p>
            <p className="text-xs text-muted-foreground mt-1">احترافيون</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-primary">{users.reduce((s, u) => s + u.total_checks, 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي الفحوصات</p>
          </div>
        </div>

        {/* Users table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-foreground">المستخدمون</h2>
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center">
              <button
                onClick={() => loadUsers(token)}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                data-testid="button-load-users"
              >
                تحميل المستخدمين
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-users">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="px-4 py-3 text-right font-medium">البريد الإلكتروني</th>
                    <th className="px-4 py-3 text-right font-medium">الاسم</th>
                    <th className="px-4 py-3 text-right font-medium">الخطة</th>
                    <th className="px-4 py-3 text-right font-medium">المحاولات</th>
                    <th className="px-4 py-3 text-right font-medium">الفحوصات</th>
                    <th className="px-4 py-3 text-right font-medium">آخر فحص</th>
                    <th className="px-4 py-3 text-right font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-user-${u.id}`}>
                      <td className="px-4 py-3 text-foreground">{u.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${
                          u.plan === "professional"
                            ? "border-primary/40 text-primary bg-primary/10"
                            : u.plan === "registered"
                            ? "border-border text-muted-foreground"
                            : "border-border text-muted-foreground/60"
                        }`}>
                          {planLabel[u.plan] ?? u.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-center">{u.trials_remaining}</td>
                      <td className="px-4 py-3 text-muted-foreground text-center">{u.total_checks}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {u.last_check_at ? new Date(u.last_check_at).toLocaleDateString("ar") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {u.plan !== "professional" ? (
                          <button
                            onClick={() => upgradeUser(u.id, "professional")}
                            disabled={upgrading === u.id}
                            className="text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                            data-testid={`button-upgrade-${u.id}`}
                          >
                            {upgrading === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            ترقية لاحترافي
                          </button>
                        ) : (
                          <button
                            onClick={() => upgradeUser(u.id, "registered")}
                            disabled={upgrading === u.id}
                            className="text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
                            data-testid={`button-downgrade-${u.id}`}
                          >
                            تخفيض للمسجل
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
