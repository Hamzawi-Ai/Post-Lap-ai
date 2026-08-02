import { useState, useEffect } from "react";
import {
  Loader2, ShieldAlert, Users, CheckCircle, UserCheck, UserX,
  Search, Plus, Pencil, Trash2, X, BarChart3, LogOut,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN_KEY = "postlap_admin_token";

const PLAN_OPTIONS = [
  { label: "Smart Fix — 400 د.ل", value: "smart_fix", plan: "smart_fix" },
  { label: "إدارة المحتوى — 800 د.ل", value: "content", plan: "content" },
  { label: "خطة الوكالة — 1000 د.ل", value: "agency", plan: "agency" },
];

const DURATION_OPTIONS = [
  { label: "30 يوماً", days: 30 },
  { label: "90 يوماً", days: 90 },
  { label: "سنة كاملة", days: 365 },
  { label: "مدى الحياة", days: 99999 },
];

interface AdminUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  subscription_label: string | null;
  subscription_expires_at: string | null;
  gender: string | null;
  is_active: boolean;
  trials_remaining: number;
  total_checks: number;
  last_check_at: string | null;
  created_at: string;
}

interface Stats {
  total_checks: number;
  total_users: number;
  checks_today: number;
  approved_count: number;
  rejected_count: number;
}

const PLAN_LABEL: Record<string, string> = {
  visitor: "زائر",
  registered: "مسجل",
  professional: "Smart Fix",
  smart_fix: "Smart Fix",
  content: "إدارة المحتوى",
  agency: "وكالة",
};

function expiryBadge(expiresAt: string | null): React.ReactNode {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days > 36500) return <span className="text-xs text-purple-400 border border-purple-400/30 px-2 py-0.5 rounded-full">مدى الحياة</span>;
  if (days < 0) return <span className="text-xs text-red-400 border border-red-400/30 px-2 py-0.5 rounded-full">منتهي</span>;
  if (days <= 7) return <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-full">{days} يوم</span>;
  return <span className="text-xs text-green-400 border border-green-400/30 px-2 py-0.5 rounded-full">{days} يوم</span>;
}

export default function Admin() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPlanOption, setAddPlanOption] = useState(PLAN_OPTIONS[0].value);
  const [addDuration, setAddDuration] = useState(DURATION_OPTIONS[0].days);
  const [addLoading, setAddLoading] = useState(false);

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editPlanOption, setEditPlanOption] = useState(PLAN_OPTIONS[0].value);
  const [editDuration, setEditDuration] = useState(DURATION_OPTIONS[0].days);
  const [editLoading, setEditLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

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
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  async function loadUsers(t: string) {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) { setToken(null); localStorage.removeItem(ADMIN_TOKEN_KEY); return; }
      setUsers(await res.json());
    } catch {
      toast({ title: "خطأ في تحميل المستخدمين", variant: "destructive" });
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadStats(t: string) {
    try {
      const res = await fetch("/api/stats", { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setStats(await res.json());
    } catch {
      console.error("Failed to load stats");
    }
  }

  useEffect(() => {
    if (token) { loadUsers(token); loadStats(token); }
  }, [token]);

  function planOptionForPlan(plan: string): string {
    const match = PLAN_OPTIONS.find((p) => p.plan === plan);
    return match?.value ?? PLAN_OPTIONS[0].value;
  }

  async function addUser() {
    if (!addEmail.trim() || !token) return;
    setAddLoading(true);
    const planOpt = PLAN_OPTIONS.find((p) => p.value === addPlanOption)!;
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: addEmail.trim(),
          name: addName.trim() || addEmail.split("@")[0],
          plan: planOpt.plan,
          subscription_label: planOpt.label.split("—")[0].trim(),
          duration_days: addDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((prev) => [data, ...prev.filter((u) => u.id !== data.id)]);
      toast({ title: "✅ تم إضافة المستخدم", description: data.email });
      setAddEmail(""); setAddName("");
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setAddLoading(false);
    }
  }

  async function saveEdit() {
    if (!editUser || !token) return;
    setEditLoading(true);
    const planOpt = PLAN_OPTIONS.find((p) => p.value === editPlanOption)!;
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}/upgrade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          plan: planOpt.plan,
          subscription_label: planOpt.label.split("—")[0].trim(),
          duration_days: editDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((prev) => prev.map((u) => u.id === data.id ? data : u));
      toast({ title: "✅ تم التعديل", description: data.email });
      setEditUser(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  }

  async function deleteUser(id: number) {
    if (!token) return;
    if (!window.confirm("هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("فشل الحذف");
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast({ title: "تم حذف المستخدم" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(email: string, active: boolean) {
    if (!token) return;
    setActivating(email);
    try {
      const res = await fetch("/api/admin/activate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((prev) => prev.map((u) => u.email === email ? data : u));
      toast({ title: active ? "تم التفعيل" : "تم الإيقاف" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setActivating(null);
    }
  }

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setUsers([]);
    setStats(null);
  }

  function openEdit(u: AdminUser) {
    setEditUser(u);
    setEditPlanOption(planOptionForPlan(u.plan));
    setEditDuration(30);
  }

  const filtered = searchFilter
    ? users.filter((u) => u.email.toLowerCase().includes(searchFilter.toLowerCase()) || u.name.toLowerCase().includes(searchFilter.toLowerCase()))
    : users;

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
      {/* Edit modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-foreground">تعديل المستخدم</h3>
              <button onClick={() => setEditUser(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground" dir="ltr">{editUser.email}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الخطة</label>
                <select
                  value={editPlanOption}
                  onChange={(e) => setEditPlanOption(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {PLAN_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المدة</label>
                <select
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {DURATION_OPTIONS.map((d) => <option key={d.days} value={d.days}>{d.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={saveEdit}
                disabled={editLoading}
                className="flex-1 bg-primary text-white py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                حفظ التعديلات
              </button>
              <button onClick={() => setEditUser(null)} className="border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm hover:bg-muted/50 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-black/90 backdrop-blur px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-primary" />
          <span className="font-black text-foreground">PostLapAI — لوحة تحكم المدير</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (token) { loadUsers(token); loadStats(token); } }}
            className="text-xs text-primary hover:underline"
            data-testid="button-refresh-users"
          >
            تحديث
          </button>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="button-admin-logout">
            <LogOut className="w-3.5 h-3.5" />
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: <BarChart3 className="w-5 h-5 text-primary" />, label: "إجمالي الفحوصات", value: stats?.total_checks ?? 0 },
            { icon: <Users className="w-5 h-5 text-primary" />, label: "إجمالي المستخدمين", value: stats?.total_users ?? 0 },
            { icon: <UserCheck className="w-5 h-5 text-primary" />, label: "مشتركون احترافيون", value: users.filter((u) => u.plan === "professional" || u.plan === "smart_fix" || u.plan === "content" || u.plan === "agency").length },
            { icon: <CheckCircle className="w-5 h-5 text-green-400" />, label: "فحوصات اليوم", value: stats?.checks_today ?? 0 },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">{s.icon}</div>
              <p className="text-2xl font-black text-foreground">{s.value.toLocaleString("ar")}</p>
              <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
            </div>
          ))}
        </section>

        {/* Add new user */}
        <section className="bg-card border border-primary/20 rounded-2xl p-6 space-y-4">
          <h2 className="font-black text-foreground flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            إضافة مستخدم جديد
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="البريد الإلكتروني *"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              dir="ltr"
              className="bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-left text-sm"
            />
            <input
              type="text"
              placeholder="الاسم (اختياري)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-right text-sm"
            />
            <select
              value={addPlanOption}
              onChange={(e) => setAddPlanOption(e.target.value)}
              className="bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            >
              {PLAN_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select
              value={addDuration}
              onChange={(e) => setAddDuration(Number(e.target.value))}
              className="bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            >
              {DURATION_OPTIONS.map((d) => <option key={d.days} value={d.days}>{d.label}</option>)}
            </select>
          </div>
          <button
            onClick={addUser}
            disabled={addLoading || !addEmail.trim()}
            className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إضافة المستخدم وتفعيل الاشتراك
          </button>
        </section>

        {/* Users table */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Users className="w-5 h-5 text-primary shrink-0" />
              <h2 className="font-bold text-foreground">جميع المستخدمين</h2>
              <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">{users.length}</span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="بحث باسم أو بريد..."
                className="w-full bg-background border border-border rounded-xl pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 text-right"
                data-testid="input-search-users"
              />
            </div>
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-users">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-right font-semibold">المستخدم</th>
                    <th className="px-4 py-3 text-right font-semibold">الخطة</th>
                    <th className="px-4 py-3 text-right font-semibold">انتهاء الاشتراك</th>
                    <th className="px-4 py-3 text-center font-semibold">الفحوصات</th>
                    <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-center font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted-foreground py-12 text-sm">لا يوجد مستخدمون</td></tr>
                  ) : filtered.map((u) => (
                    <tr key={u.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors" data-testid={`row-user-${u.id}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground text-sm">{u.name || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          u.plan === "professional"
                            ? "border-primary/40 text-primary bg-primary/10"
                            : "border-border text-muted-foreground"
                        }`}>
                          {u.subscription_label ?? PLAN_LABEL[u.plan] ?? u.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">{expiryBadge(u.subscription_expires_at)}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{u.total_checks}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActive(u.email, !u.is_active)}
                          disabled={activating === u.email}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 mx-auto ${
                            u.is_active
                              ? "border-green-400/30 text-green-400 hover:bg-red-400/10 hover:text-red-400 hover:border-red-400/30"
                              : "border-red-400/30 text-red-400 hover:bg-green-400/10 hover:text-green-400 hover:border-green-400/30"
                          }`}
                          data-testid={`button-toggle-${u.id}`}
                        >
                          {activating === u.email
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : u.is_active
                              ? <><UserCheck className="w-3 h-3" /> نشط</>
                              : <><UserX className="w-3 h-3" /> موقوف</>}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-center">
                          <button
                            onClick={() => openEdit(u)}
                            className="text-xs text-primary border border-primary/20 px-2.5 py-1 rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-1"
                            data-testid={`button-edit-${u.id}`}
                          >
                            <Pencil className="w-3 h-3" /> تعديل
                          </button>
                          <button
                            onClick={() => deleteUser(u.id)}
                            disabled={deletingId === u.id}
                            className="text-xs text-red-400 border border-red-400/20 px-2.5 py-1 rounded-lg hover:bg-red-400/10 transition-colors flex items-center gap-1 disabled:opacity-50"
                            data-testid={`button-delete-${u.id}`}
                          >
                            {deletingId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Trash2 className="w-3 h-3" /> حذف</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
