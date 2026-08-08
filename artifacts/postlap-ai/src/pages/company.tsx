import { useState, useEffect } from "react";
import { Loader2, Store, ArrowRight, Trash2 } from "lucide-react";
import BrandSetupForm from "@/components/BrandSetupForm";
import { getToken, handleAuthError, clearAuth } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";

interface MemoryResponse {
  memory: {
    business_name?: string | null;
    business_type?: string | null;
    address?: string | null;
    phone?: string | null;
    logo_url?: string | null;
    notes?: string | null;
    design_samples?: string | null;
    brand_onboarded?: boolean;
  } | null;
}

export default function CompanySettings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [memory, setMemory] = useState<MemoryResponse["memory"]>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = "/";
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/hamzawi/memory", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (handleAuthError(res)) {
          clearAuth();
          window.location.href = "/";
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as MemoryResponse;
          setMemory(data.memory);
        }
      } catch {
        // Continue with empty form on network errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  async function handleDeleteAccount() {
    const token = getToken();
    if (!token) return;
    if (
      !window.confirm(
        "سيتم حذف حسابك وكل بياناتك نهائياً: نشاطك التجاري، الشعار، التصاميم، المحادثات، والملفات المرفوعة. لا يمكن التراجع عن هذا الإجراء. هل أنت متأكد؟",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "فشل حذف الحساب");
      }
      toast({ title: "تم حذف حسابك وكل بياناتك نهائياً" });
      clearAuth();
      window.location.href = "/";
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Store className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-black">إعدادات الشركة</h1>
              <p className="text-xs text-muted-foreground">تعديل بيانات النشاط وهويته البصرية</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/brand"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              data-testid="company-view-brand"
            >
              عرض الهوية
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              data-testid="company-back-home"
            >
              الرئيسية
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
          <BrandSetupForm
            mode="edit"
            initial={memory}
            onSubmit={() => navigate("/")}
          />
        </div>

        <div className="mt-6 bg-card border border-destructive/30 rounded-2xl p-6">
          <h2 className="text-sm font-black text-destructive flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            منطقة الخطر
          </h2>
          <p className="text-xs text-muted-foreground mt-1.5">
            حذف الحساب نهائياً يزيل نشاطك التجاري، شعارك، تصاميمك، محادثاتك مع
            PostLab، وكل الملفات المرفوعة. لا يمكن التراجع.
          </p>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-destructive border border-destructive/40 rounded-xl px-4 py-2 hover:bg-destructive/10 transition-colors disabled:opacity-50"
            data-testid="company-delete-account"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري حذف الحساب...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                حذف حسابي نهائياً
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
