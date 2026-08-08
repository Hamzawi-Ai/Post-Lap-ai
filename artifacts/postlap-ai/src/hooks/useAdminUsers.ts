import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ADMIN_TOKEN_KEY,
  DEFAULT_PLAN_OPTIONS,
  DURATION_OPTIONS,
  type AdminUser,
  type PlanOption,
} from "@/lib/admin-shared";

// Shared user-management data + actions for the Owner Dashboard pages
// (Users, Subscriptions). Mirrors the original admin.tsx logic — no business
// logic changes, only relocation.
export function useAdminUsers(token: string | null) {
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>(DEFAULT_PLAN_OPTIONS);
  const [searchFilter, setSearchFilter] = useState("");

  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPlanOption, setAddPlanOption] = useState(DEFAULT_PLAN_OPTIONS[0].value);
  const [addDuration, setAddDuration] = useState(DURATION_OPTIONS[0].days);
  const [addLoading, setAddLoading] = useState(false);

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editPlanOption, setEditPlanOption] = useState(DEFAULT_PLAN_OPTIONS[0].value);
  const [editDuration, setEditDuration] = useState(DURATION_OPTIONS[0].days);
  const [editLoading, setEditLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  const loadUsers = useCallback(
    async (t: string) => {
      setUsersLoading(true);
      try {
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          window.location.reload();
          return;
        }
        setUsers(await res.json());
      } catch {
        toast({ title: "خطأ في تحميل المستخدمين", variant: "destructive" });
      } finally {
        setUsersLoading(false);
      }
    },
    [toast],
  );

  // Plan options derive from /api/config (single source of truth = config.json).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) return;
        const cfg = await res.json();
        const plans = cfg?.pricing?.plans as Array<{ id: string; name: string; price: number }> | undefined;
        const currency = (cfg?.pricing?.currency as string | undefined) ?? "د.ل";
        if (Array.isArray(plans) && plans.length > 0) {
          const opts: PlanOption[] = plans.map((p) => ({
            label: `${p.name} — ${p.price} ${currency}`,
            value: p.id,
            plan: p.id,
          }));
          if (!cancelled) setPlanOptions(opts);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (token) loadUsers(token);
  }, [token, loadUsers]);

  function planOptionForPlan(plan: string): string {
    const match = planOptions.find((p) => p.plan === plan);
    return match?.value ?? planOptions[0].value;
  }

  async function addUser() {
    if (!addEmail.trim() || !token) return;
    setAddLoading(true);
    const planOpt = planOptions.find((p) => p.value === addPlanOption)!;
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
    const planOpt = planOptions.find((p) => p.value === editPlanOption)!;
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

  function openEdit(u: AdminUser) {
    setEditUser(u);
    setEditPlanOption(planOptionForPlan(u.plan));
    setEditDuration(30);
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

  function reload() {
    if (token) loadUsers(token);
  }

  return {
    users,
    usersLoading,
    planOptions,
    searchFilter,
    setSearchFilter,
    reload,
    addEmail,
    setAddEmail,
    addName,
    setAddName,
    addPlanOption,
    setAddPlanOption,
    addDuration,
    setAddDuration,
    addLoading,
    addUser,
    editUser,
    setEditUser,
    editPlanOption,
    setEditPlanOption,
    editDuration,
    setEditDuration,
    editLoading,
    saveEdit,
    openEdit,
    deletingId,
    deleteUser,
    activating,
    toggleActive,
  };
}
