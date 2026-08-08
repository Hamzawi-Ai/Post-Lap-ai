import { Loader2, Users as UsersIcon, Search, Plus, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { ADMIN_TOKEN_KEY, DURATION_OPTIONS, PLAN_LABEL, expiryBadge } from "@/lib/admin-shared";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import AdminEditModal from "@/components/admin/AdminEditModal";

export default function Users() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const {
    users, usersLoading, planOptions, searchFilter, setSearchFilter,
    addEmail, setAddEmail, addName, setAddName, addPlanOption, setAddPlanOption,
    addDuration, setAddDuration, addLoading, addUser,
    editUser, setEditUser, editPlanOption, setEditPlanOption,
    editDuration, setEditDuration, editLoading, saveEdit, openEdit,
    deletingId, deleteUser, activating, toggleActive,
  } = useAdminUsers(token);

  const filtered = searchFilter
    ? users.filter((u) => u.email.toLowerCase().includes(searchFilter.toLowerCase()) || u.name.toLowerCase().includes(searchFilter.toLowerCase()))
    : users;

  return (
    <div className="space-y-6">
      {editUser && (
        <AdminEditModal
          user={editUser}
          planOptions={planOptions}
          planOption={editPlanOption}
          onPlanOptionChange={setEditPlanOption}
          duration={editDuration}
          onDurationChange={setEditDuration}
          loading={editLoading}
          onSave={saveEdit}
          onClose={() => setEditUser(null)}
        />
      )}

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
            {planOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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
            <UsersIcon className="w-5 h-5 text-primary shrink-0" />
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
    </div>
  );
}
