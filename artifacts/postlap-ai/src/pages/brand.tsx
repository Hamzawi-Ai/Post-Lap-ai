import { useState, useEffect } from "react";
import { Loader2, Store, ArrowRight, MapPin, Phone, Palette, Images, CheckCircle2, CircleAlert, ImagePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken, handleAuthError, clearAuth } from "@/lib/utils";
import { brandProfileCompletion, type BrandProfileData } from "@/lib/onboarding";
import { Link } from "wouter";

interface MemoryResponse {
  memory: BrandProfileData | null;
}

function parseDesignSamples(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export default function BrandIdentity() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [memory, setMemory] = useState<BrandProfileData | null>(null);

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
        // Continue with empty state on network errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const completion = brandProfileCompletion(memory);
  const samples = parseDesignSamples(memory?.design_samples);

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
              <h1 className="text-xl font-black">هوية النشاط التجاري</h1>
              <p className="text-xs text-muted-foreground">ملف نشاطك كما يحفظه حمزاوي ويفهمه</p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            data-testid="brand-back-home"
          >
            الرئيسية
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Completion card */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-foreground">حالة اكتمال الملف</p>
            <p className="text-2xl font-black text-primary" data-testid="brand-completion-percent">
              {completion.percent}%
            </p>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          {completion.percent < 100 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground mb-1">أضف هذه العناصر لتكتمل هوية نشاطك وتحصل على نتائج أفضل:</p>
              {completion.missing.map((item) => (
                <p key={item} className="flex items-center gap-2 text-xs text-foreground">
                  <CircleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  {item}
                </p>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ملف نشاطك مكتمل بالكامل — حمزاوي جاهز للعمل بهوية كاملة.
            </p>
          )}
        </div>

        {/* Brand card */}
        {memory ? (
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl border border-border overflow-hidden flex items-center justify-center bg-muted shrink-0">
                {memory.logo_url ? (
                  <img src={memory.logo_url} alt="شعار النشاط" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-black" data-testid="brand-name">
                  {memory.business_name || "—"}
                </h2>
                {memory.business_type && (
                  <p className="text-sm text-muted-foreground" data-testid="brand-type">{memory.business_type}</p>
                )}
              </div>
            </div>

            {memory.notes && (
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1">النبذة عن النشاط</p>
                <p className="text-sm text-foreground leading-relaxed">{memory.notes}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {memory.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-primary shrink-0" />
                  <span dir="ltr">{memory.phone}</span>
                </div>
              )}
              {memory.address && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  {memory.address}
                </div>
              )}
              {memory.primary_colors && (
                <div className="flex items-center gap-2 text-sm">
                  <Palette className="w-4 h-4 text-primary shrink-0" />
                  {memory.primary_colors}
                </div>
              )}
              {memory.preferred_style && (
                <div className="flex items-center gap-2 text-sm">
                  <Store className="w-4 h-4 text-primary shrink-0" />
                  الأسلوب: {memory.preferred_style}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Images className="w-4 h-4 text-primary" />
                التصاميم المرجعية ({samples.length})
              </p>
              {samples.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {samples.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`تصميم مرجعي ${i + 1}`}
                      className="w-16 h-16 rounded-lg object-cover border border-border"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">لا توجد تصاميم مرجعية بعد — ارفعها من زر المشبك في المحادثة.</p>
              )}
            </div>

            <div className="pt-2">
              <Link
                href="/company"
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-black text-sm hover:opacity-90 transition-opacity"
                data-testid="brand-edit-link"
              >
                تعديل بيانات النشاط
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-10 text-center space-y-4">
            <Store className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              لم يتم حفظ بيانات النشاط بعد. يمكنك إعدادها الآن ليتذكّرها حمزاوي في كل تصميم.
            </p>
            <Link
              href="/company"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-black text-sm hover:opacity-90 transition-opacity"
            >
              إعداد نشاطك
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
