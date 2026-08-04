import { useState, useRef, useEffect } from "react";
import { Loader2, ImagePlus, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/utils";

const TOKEN_KEY = "postlap_token";

interface BrandSetupFormProps {
  mode: "onboarding" | "edit";
  initial?: BrandProfile | null;
  onSubmit?: () => void;
}

interface BrandProfile {
  business_name?: string | null;
  business_type?: string | null;
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  notes?: string | null;
  design_samples?: string | null;
}

interface FormFields {
  business_name: string;
  business_type: string;
  address: string;
  phone: string;
  notes: string;
}

interface AssetMetadata {
  id: string;
  category: string;
  filename: string;
  relativePath: string;
  publicUrl: string;
  size: number;
  mimeType: string;
}

async function uploadAsset(file: File, category: "logo" | "portfolio" = "portfolio"): Promise<AssetMetadata | null> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);
    const res = await fetch("/api/hamzawi/upload-asset", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (res.ok) {
      const data = await res.json() as AssetMetadata;
      return data ?? null;
    }
    return null;
  } catch {
    return null;
  }
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

const REQUIRED = ["business_name", "business_type", "address", "phone", "notes"] as const;
type RequiredKey = (typeof REQUIRED)[number];

export default function BrandSetupForm({ mode, initial, onSubmit }: BrandSetupFormProps) {
  const { toast } = useToast();
  const [fields, setFields] = useState<FormFields>({
    business_name: initial?.business_name ?? "",
    business_type: initial?.business_type ?? "",
    address: initial?.address ?? "",
    phone: initial?.phone ?? "",
    notes: initial?.notes ?? "",
  });
  const [logoUrl, setLogoUrl] = useState<string>(initial?.logo_url ?? "");
  const [designSamples, setDesignSamples] = useState<string[]>(
    parseDesignSamples(initial?.design_samples),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<RequiredKey, string>>>({});
  const logoInputRef = useRef<HTMLInputElement>(null);
  const samplesInputRef = useRef<HTMLInputElement>(null);

  const isOnboarding = mode === "onboarding";

  function setField(key: keyof FormFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<RequiredKey, string>> = {};
    for (const key of REQUIRED) {
      if (!fields[key].trim()) next[key] = "هذا الحقل مطلوب";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    const result = await uploadAsset(file, "logo");
    setUploading(false);
    if (result) {
      setLogoUrl(result.publicUrl);
      toast({ title: "تم رفع الشعار ✓" });
    } else {
      toast({ title: "خطأ", description: "فشل رفع الشعار", variant: "destructive" });
    }
  }

  async function handleDesignSamplesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";
    setUploading(true);
    const urls: string[] = [];
    for (const file of files) {
      const result = await uploadAsset(file, "portfolio");
      if (result) urls.push(result.publicUrl);
    }
    setUploading(false);
    if (urls.length > 0) {
      setDesignSamples((prev) => [...prev, ...urls]);
      toast({ title: `تم رفع ${urls.length} تصميم ✓` });
    } else {
      toast({ title: "خطأ", description: "فشل رفع التصاميم", variant: "destructive" });
    }
  }

  async function handleSave() {
    if (!validate()) {
      toast({ title: "أكمل الحقول المطلوبة", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        ...fields,
        logo_url: logoUrl || undefined,
        design_samples: designSamples,
        ...(isOnboarding ? { brand_onboarded: true } : {}),
      };
      const res = await fetch("/api/hamzawi/memory", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() ?? ""}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "فشل الحفظ");
      }
      toast({ title: isOnboarding ? "اكتمل إعداد النشاط التجاري ✅" : "تم حفظ التعديلات ✓" });
      onSubmit?.();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-foreground">
          اسم النشاط التجاري <span className="text-destructive">*</span>
        </label>
        <input
          className={inputCls}
          placeholder="مثال: مخبز حمزاوي"
          value={fields.business_name}
          onChange={(e) => setField("business_name", e.target.value)}
          data-testid="onboarding-input-name"
        />
        {errors.business_name && <p className="text-xs text-destructive">{errors.business_name}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-foreground">
          مجال النشاط <span className="text-destructive">*</span>
        </label>
        <input
          className={inputCls}
          placeholder="مثال: مطعم، متجر، عيادة، شركة خدمات"
          value={fields.business_type}
          onChange={(e) => setField("business_type", e.target.value)}
          data-testid="onboarding-input-type"
        />
        {errors.business_type && <p className="text-xs text-destructive">{errors.business_type}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-foreground">
          نبذة مختصرة عن النشاط <span className="text-destructive">*</span>
        </label>
        <textarea
          className={`${inputCls} resize-none h-24`}
          placeholder="مثال: مخبز يقدم خبزاً ومعجنات طازجة يومياً في وسط المدينة"
          value={fields.notes}
          onChange={(e) => setField("notes", e.target.value)}
          data-testid="onboarding-input-notes"
        />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground">
            رقم الهاتف <span className="text-destructive">*</span>
          </label>
          <input
            className={inputCls}
            placeholder="مثال: 0912345678"
            value={fields.phone}
            onChange={(e) => setField("phone", e.target.value)}
            data-testid="onboarding-input-phone"
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-foreground">
            العنوان <span className="text-destructive">*</span>
          </label>
          <input
            className={inputCls}
            placeholder="مثال: مصراته، وسط البلد"
            value={fields.address}
            onChange={(e) => setField("address", e.target.value)}
            data-testid="onboarding-input-address"
          />
          {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
        </div>
      </div>

      {/* Logo (optional) */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-foreground">
          شعار الشركة <span className="text-muted-foreground font-normal">(اختياري — يمكن إضافته لاحقاً)</span>
        </label>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleLogoUpload}
        />
        {logoUrl ? (
          <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
            <img src={logoUrl} alt="logo" className="w-12 h-12 rounded-lg object-cover border border-border" />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploading}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                تغيير
              </button>
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                className="text-xs text-destructive hover:underline"
              >
                حذف
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-border rounded-xl px-4 py-3 text-sm text-muted-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
            data-testid="onboarding-upload-logo"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            رفع الشعار
          </button>
        )}
      </div>

      {/* Previous designs (optional) */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-foreground">
          منشورات أو تصاميم سابقة <span className="text-muted-foreground font-normal">(اختياري — نستخدمها كمرجع)</span>
        </label>
        <input
          ref={samplesInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={handleDesignSamplesUpload}
        />
        <button
          type="button"
          onClick={() => samplesInputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-border rounded-xl px-4 py-3 text-sm text-muted-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
          data-testid="onboarding-upload-samples"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          رفع التصاميم (يمكن اختيار عدة ملفات)
        </button>
        {designSamples.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {designSamples.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt={`sample ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-border" />
                <button
                  type="button"
                  onClick={() => setDesignSamples((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
                  aria-label="حذف"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-black text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          data-testid="onboarding-submit"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري الحفظ...
            </>
          ) : isOnboarding ? (
            "حفظ والبدء مع حمزاوي 🚀"
          ) : (
            "حفظ التعديلات"
          )}
        </button>
      </div>
    </div>
  );
}
