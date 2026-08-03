import { useState, useEffect } from "react";
import { Loader2, Store, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BrandSetupForm from "@/components/BrandSetupForm";
import { getToken, handleAuthError, clearAuth } from "@/lib/utils";

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
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
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
          <a
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            data-testid="company-back-home"
          >
            الرئيسية
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
          {memory ? (
            <BrandSetupForm
              mode="edit"
              initial={memory}
              onSubmit={() => toast({ title: "تم حفظ التعديلات ✓" })}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              لا توجد بيانات نشاط محفوظة بعد. يمكنك إضافتها الآن.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
