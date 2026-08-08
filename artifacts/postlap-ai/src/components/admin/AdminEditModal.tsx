import { X, CheckCircle, Loader2 } from "lucide-react";
import { DURATION_OPTIONS, type AdminUser, type PlanOption } from "@/lib/admin-shared";

interface AdminEditModalProps {
  user: AdminUser;
  planOptions: PlanOption[];
  planOption: string;
  onPlanOptionChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  loading: boolean;
  onSave: () => void;
  onClose: () => void;
}

export default function AdminEditModal({
  user,
  planOptions,
  planOption,
  onPlanOptionChange,
  duration,
  onDurationChange,
  loading,
  onSave,
  onClose,
}: AdminEditModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-foreground">تعديل المستخدم</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground" dir="ltr">{user.email}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الخطة</label>
            <select
              value={planOption}
              onChange={(e) => onPlanOptionChange(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {planOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المدة</label>
            <select
              value={duration}
              onChange={(e) => onDurationChange(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {DURATION_OPTIONS.map((d) => <option key={d.days} value={d.days}>{d.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onSave}
            disabled={loading}
            className="flex-1 bg-primary text-white py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            حفظ التعديلات
          </button>
          <button onClick={onClose} className="border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm hover:bg-muted/50 transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
