import { useState, useEffect } from "react";
import { Loader2, ShieldCheck, Building2 } from "lucide-react";
import BrandSetupForm from "@/components/BrandSetupForm";
import { POST_ONBOARDING_REDIRECT } from "@/lib/onboarding";
import { getToken, handleAuthError, clearAuth } from "@/lib/utils";
import { useLocation } from "wouter";

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

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [memory, setMemory] = useState<MemoryResponse["memory"]>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = POST_ONBOARDING_REDIRECT;
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/hamzawi/memory", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (handleAuthError(res)) {
          clearAuth();
          window.location.href = POST_ONBOARDING_REDIRECT;
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
        <div className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mx-auto">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">إعداد نشاطك التجاري</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            هذه البيانات تُحفظ كذاكرة دائمة لنشاطك التجاري — يستخدمها PostLab تلقائياً عند إنشاء أي
            منشور أو تصميم، بدون الحاجة لإعادة شرح نشاطك في كل مرة.
          </p>
          <div className="inline-flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-full px-3 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            بياناتك تُستخدم فقط داخل منصة PostLapAI
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
          <BrandSetupForm
            mode="onboarding"
            initial={memory}
            onSubmit={() => {
              navigate(POST_ONBOARDING_REDIRECT);
            }}
          />
        </div>
      </div>
    </div>
  );
}
