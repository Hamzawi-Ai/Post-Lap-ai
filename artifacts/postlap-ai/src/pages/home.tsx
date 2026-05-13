import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle, Loader2, Copy, Check, Shield, Eye, Lock } from "lucide-react";
import { useGetConfig, useGetStats, getGetConfigQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import HamzawiChat from "@/components/HamzawiChat";

const TRIALS_KEY = "postlap_trials";
const MAX_VISITOR_TRIALS = 3;
const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";
const GENDER_KEY = "postlap_gender";
const COOKIE_KEY = "postlap_cookie_consent";

type CheckStatus = "ممتاز" | "جيد" | "مرفوض";

interface LocalUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  gender: string | null;
  is_active: boolean;
  trials_remaining: number;
  total_checks: number;
}

function getTrials(): number {
  return parseInt(localStorage.getItem(TRIALS_KEY) ?? String(MAX_VISITOR_TRIALS), 10);
}
function decrementTrials() {
  const t = Math.max(0, getTrials() - 1);
  localStorage.setItem(TRIALS_KEY, String(t));
  return t;
}
function getStoredUser(): LocalUser | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "null"); } catch { return null; }
}
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Discount active if month is May (4) or June (5) — May 2026 = month index 4
function isDiscountActive(): boolean {
  const m = new Date().getMonth();
  const y = new Date().getFullYear();
  return (m === 4 || m === 5) && y === 2026;
}

export default function Home() {
  const { toast } = useToast();
  const { data: config } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });

  const [user, setUser] = useState<LocalUser | null>(getStoredUser);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [checkResult, setCheckResult] = useState<{ status: CheckStatus; message: string; score: number; frames_checked?: number | null } | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [trialBlockModal, setTrialBlockModal] = useState(false);
  const [genderModal, setGenderModal] = useState(false);
  const [product, setProduct] = useState("");
  const [dialect, setDialect] = useState<"شرقية" | "غربية" | "جنوبية">("غربية");
  const [generatedText, setGeneratedText] = useState("");
  const [copiedText, setCopiedText] = useState(false);
  const [cookieConsent, setCookieConsent] = useState(() => !!localStorage.getItem(COOKIE_KEY));
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const googleBtnModalRef = useRef<HTMLDivElement>(null);

  const gender = (user?.gender ?? localStorage.getItem(GENDER_KEY) ?? null) as "male" | "female" | null;
  const discountActive = isDiscountActive();

  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;
    const w = window as any;
    if (!w.google?.accounts?.id) return;
    w.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
    });
    if (googleBtnRef.current) {
      w.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline", size: "large", text: "signin_with", locale: "ar",
      });
    }
    if (googleBtnModalRef.current) {
      w.google.accounts.id.renderButton(googleBtnModalRef.current, {
        theme: "outline", size: "large", text: "signin_with", locale: "ar",
      });
    }
  }, [googleBtnRef.current, googleBtnModalRef.current]);

  async function handleGoogleCredential(response: any) {
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      if (!res.ok) throw new Error("فشل تسجيل الدخول");
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      toast({ title: "تم تسجيل الدخول", description: `مرحبا ${data.user.name}` });
      // Show gender modal if gender not set yet
      if (!data.user.gender) setGenderModal(true);
    } catch {
      toast({ title: "خطأ", description: "فشل تسجيل الدخول", variant: "destructive" });
    }
  }

  async function saveGender(g: "male" | "female") {
    localStorage.setItem(GENDER_KEY, g);
    setGenderModal(false);
    const token = getToken();
    if (!token) return;
    try {
      await fetch("/api/users/me/gender", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gender: g }),
      });
      if (user) {
        const updated = { ...user, gender: g };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);
      }
    } catch {}
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    toast({ title: "تم تسجيل الخروج" });
  }

  function startCountdown() {
    setCountdown(8);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }
  function stopCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
  }

  async function handleFile(file: File) {
    const allowed = ["image/png", "image/jpeg", "video/mp4"];
    if (!allowed.includes(file.type)) {
      toast({ title: "نوع الملف غير مدعوم", description: "فقط صور PNG/JPG أو فيديو MP4", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "الملف كبير", description: "الحد الأقصى 50 ميجابايت", variant: "destructive" });
      return;
    }
    if (!user) {
      const trials = getTrials();
      if (trials <= 0) { setTrialBlockModal(true); return; }
    } else if (user.plan !== "professional" && user.trials_remaining <= 0) {
      setTrialBlockModal(true); return;
    }

    // Show image preview (images only)
    if (file.type !== "video/mp4") {
      const url = URL.createObjectURL(file);
      setUploadedImageUrl(url);
    } else {
      setUploadedImageUrl(null);
    }

    setCheckResult(null);
    setChecking(true);
    startCountdown();

    const formData = new FormData();
    formData.append("file", file);
    const token = getToken();
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      stopCountdown();
      setChecking(false);
      if (!res.ok) { toast({ title: "خطأ", description: data.error, variant: "destructive" }); return; }
      setCheckResult(data);
      if (!user) decrementTrials();
    } catch {
      stopCountdown();
      setChecking(false);
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [user]);

  async function handleGenerateText() {
    if (!product.trim()) { toast({ title: "أدخل معلومات المنتج", variant: "destructive" }); return; }
    setTextLoading(true);
    try {
      const res = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, dialect }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGeneratedText(data.text);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setTextLoading(false);
    }
  }

  function copyToClipboard(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  function acceptCookies() {
    localStorage.setItem(COOKIE_KEY, "1");
    setCookieConsent(true);
  }

  const statusColor: Record<CheckStatus, string> = {
    "ممتاز": "border-green-400/40 bg-green-400/5",
    "جيد": "border-yellow-400/40 bg-yellow-400/5",
    "مرفوض": "border-red-400/40 bg-red-400/5",
  };
  const statusTextColor: Record<CheckStatus, string> = {
    "ممتاز": "text-green-400",
    "جيد": "text-yellow-400",
    "مرفوض": "text-red-400",
  };
  const statusIcon: Record<CheckStatus, React.ReactNode> = {
    "ممتاز": <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />,
    "جيد": <AlertCircle className="w-8 h-8 text-yellow-400 shrink-0" />,
    "مرفوض": <XCircle className="w-8 h-8 text-red-400 shrink-0" />,
  };
  const statusBarColor: Record<CheckStatus, string> = {
    "ممتاز": "bg-green-400",
    "جيد": "bg-yellow-400",
    "مرفوض": "bg-red-400",
  };

  const faqs = [
    { q: "كيف يعمل PostLapAI؟", a: "ارفع صورة أو فيديو إعلانك، يحللها الذكاء الاصطناعي مقارنةً بسياسات Meta وTikTok ويعطيك نتيجة فورية." },
    { q: "هل نتائج الفحص دقيقة 100%؟", a: "الدقة 90% لأن سياسات المنصات تتحدث باستمرار. النتيجة مساعدة لكنها لا تضمن قبول المنصة." },
    { q: "هل تخزنون إعلاناتنا؟", a: "لا، نحذف جميع الملفات فور انتهاء التحليل. لا نخزن محتواك أبداً." },
    { q: "ما الفرق بين الخطط؟", a: "Smart Fix للإصلاح الفوري، إدارة المحتوى للشركات، وخطة الوكالة للمكاتب والمشاريع المتعددة." },
    { q: "كيف أشترك؟", a: "تواصل معنا عبر واتساب وأرسل اسم الخطة التي تريدها. نقبل الدفع بالتحويل المصرفي." },
    { q: "هل يدعم فيديوهات تيك توك؟", a: "نعم، نقبل ملفات MP4. يُرفع الفيديو ويُحلل فريم بفريم وفق سياسات Meta وTikTok." },
  ];

  const accuracyText = config?.accuracy_text ?? "النتيجة 90% صحيحة بسبب تحديث سياسات Meta & TikTok باستمرار";
  const whatsapp = config?.whatsapp ?? "218915811115";

  // Pricing with optional 50% discount
  const plans = [
    {
      id: "smart_fix",
      name: "Smart Fix",
      nameAr: "الإصلاح الذكي",
      price: 400,
      desc: "للمعلنين الأفراد",
      features: ["تصحيح الإعلانات المرفوضة", "فحوصات غير محدودة", "فيديو حتى 60 ثانية", "دعم أولوية"],
      badge: null,
      cta: "اشترك في Smart Fix",
      highlight: false,
    },
    {
      id: "content_mgmt",
      name: "إدارة المحتوى",
      nameAr: "للشركات والمتاجر",
      price: 800,
      desc: "للشركات والمتاجر",
      features: ["كل مميزات Smart Fix", "لوحة إدارة المحتوى", "توليد نصوص بالليبي الأصيل", "تصميم منشورات مع الشعار"],
      badge: "الأكثر طلباً",
      cta: "اشترك في إدارة المحتوى",
      highlight: true,
    },
    {
      id: "agency",
      name: "خطة الوكالة",
      nameAr: "للمكاتب الإعلانية",
      price: 1000,
      desc: "+ 400 د.ل لكل مشروع إضافي",
      features: ["كل مميزات إدارة المحتوى", "مشاريع متعددة", "بيانات وهوية مستقلة لكل مشروع", "مدير حساب مخصص"],
      badge: null,
      cta: "اشترك في خطة الوكالة",
      highlight: false,
    },
  ];

  const agentsList = [
    {
      country: "ليبيا", flag: "🇱🇾",
      company: "شركة PostLapAI للخدمات الرقمية",
      address: "مصراته — وسط البلد، مقابل المسرح",
      wa: whatsapp, live: true,
    },
    {
      country: "الأردن", flag: "🇯🇴",
      company: "شركة TAGS",
      address: "عمان، شارع الوكالات، مبنى الدعاس، ط4",
      wa: "962799011104", live: true,
    },
    {
      country: "السعودية", flag: "🇸🇦",
      company: "شركة الحرمين",
      address: "الرياض، شارع الملك سليمان، برج الحرمين 103",
      wa: "966582905040", live: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-black/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-primary tracking-tight">PostLap<span className="text-foreground">AI</span></span>
            <span className="hidden sm:inline text-xs text-muted-foreground border border-border rounded px-2 py-0.5">فحص الإعلانات</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#upload" className="hover:text-foreground transition-colors">الفحص</a>
            <a href="#generate" className="hover:text-foreground transition-colors">توليد النص</a>
            <a href="#agents" className="hover:text-foreground transition-colors">الوكلاء</a>
            <a href="/admin" className="hover:text-foreground transition-colors">لوحة التحكم</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${user.plan === "professional" ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                  {user.plan === "professional" ? "احترافي" : user.plan === "registered" ? "مسجل" : "زائر"}
                </span>
                <button onClick={logout} className="text-xs text-muted-foreground hover:text-foreground transition-colors">خروج</button>
              </div>
            ) : (
              <a href="#plans" className="text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                سجّل الدخول
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-16">

        {/* 1. Upload / Check */}
        <section id="upload" className="w-full">
          {/* Prominent headline */}
          <div className="text-center mb-6">
            <h1 className="text-3xl sm:text-4xl font-black text-foreground leading-tight">
              بوست لاب:{" "}
              <span className="text-primary">احترافي في معرفة المخالفات</span>
            </h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              افحص إعلانك قبل النشر وتجنّب الرفض من Meta وTikTok
            </p>
          </div>

          {/* Upload dropzone */}
          <div
            className={`relative w-full border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 ${
              dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-card"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !checking && fileInputRef.current?.click()}
            data-testid="upload-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,video/mp4"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              data-testid="input-file"
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold text-foreground">اسحب وأفلت الصورة أو الريلز هنا للفحص</p>
                <p className="text-muted-foreground mt-1 text-sm">أو انقر للاختيار — PNG، JPG، MP4 — حتى 50 ميجابايت</p>
              </div>
              <p className="text-xs text-muted-foreground/70 max-w-md">{accuracyText}</p>
            </div>
          </div>

          {/* Trials remaining hint */}
          {!user && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              متبقي لك <span className="text-primary font-bold">{getTrials()}</span> محاولات مجانية —{" "}
              <a href="#plans" className="text-primary hover:underline">سجّل للحصول على المزيد</a>
            </p>
          )}

          {/* Countdown timer */}
          {checking && countdown !== null && (
            <div className="mt-6 flex flex-col items-center gap-3" data-testid="status-loading">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="34"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - countdown / 8)}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-primary">{countdown}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">جاري تحليل الإعلان...</p>
            </div>
          )}
          {checking && countdown === null && (
            <div className="mt-6 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">لحظة أخيرة...</p>
            </div>
          )}

          {/* Result with image preview */}
          {checkResult && !checking && (
            <div className={`mt-6 rounded-2xl border p-4 sm:p-6 ${statusColor[checkResult.status]}`} data-testid="status-result">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Image preview with status overlay */}
                {uploadedImageUrl && (
                  <div className="relative w-full sm:w-32 h-32 rounded-xl overflow-hidden border border-border shrink-0">
                    <img
                      src={uploadedImageUrl}
                      alt="الإعلان المرفوع"
                      className="w-full h-full object-cover"
                    />
                    <div className={`absolute inset-0 flex items-center justify-center ${
                      checkResult.status === "ممتاز" ? "bg-green-500/20" :
                      checkResult.status === "جيد" ? "bg-yellow-500/20" : "bg-red-500/20"
                    }`}>
                      <div className="bg-black/60 rounded-full p-2">
                        {statusIcon[checkResult.status]}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    {!uploadedImageUrl && statusIcon[checkResult.status]}
                    <div className="flex-1">
                      <p className={`text-xl font-black ${statusTextColor[checkResult.status]}`}>{checkResult.message}</p>
                      {checkResult.frames_checked != null && (
                        <p className="text-sm text-muted-foreground mt-1">فُحص {checkResult.frames_checked} فريم</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">النقاط:</span>
                    <div className="flex-1 h-2 rounded-full bg-black/20 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${statusBarColor[checkResult.status]}`}
                        style={{ width: `${checkResult.score}%` }}
                      />
                    </div>
                    <span className={`text-sm font-black ${statusTextColor[checkResult.status]}`}>{checkResult.score}/100</span>
                  </div>

                  {/* CTA after result */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {checkResult.status === "ممتاز" && (
                      <a
                        href="#generate"
                        className="text-sm bg-green-500/10 text-green-400 border border-green-400/20 px-4 py-2 rounded-xl hover:bg-green-500/20 transition-colors font-semibold"
                      >
                        ✍️ ولّد نصاً لهذا الإعلان
                      </a>
                    )}
                    {checkResult.status === "جيد" && (
                      <a
                        href={`https://wa.me/${whatsapp}?text=أريد الاشتراك في Smart Fix لتحسين إعلاني`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm bg-yellow-500/10 text-yellow-400 border border-yellow-400/20 px-4 py-2 rounded-xl hover:bg-yellow-500/20 transition-colors font-semibold"
                      >
                        🔧 حسّن إعلانك مع Smart Fix
                      </a>
                    )}
                    {checkResult.status === "مرفوض" && (
                      <a
                        href={`https://wa.me/${whatsapp}?text=أريد الاشتراك في Smart Fix لتصحيح إعلاني المرفوض`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-xl hover:opacity-90 transition-opacity font-semibold"
                      >
                        🚀 أصلح إعلانك الآن — Smart Fix
                      </a>
                    )}
                    {!user && (
                      <a href="#plans" className="text-sm text-muted-foreground border border-border px-4 py-2 rounded-xl hover:bg-muted/50 transition-colors">
                        سجّل للحصول على المزيد
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 2. Ad Text Generator */}
        <section id="generate" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-2">ولّد نص إعلانك</h2>
          <p className="text-center text-muted-foreground text-sm mb-8">نصوص بالليبي الأصيل، متوافقة مع سياسات Meta</p>
          <div className="max-w-2xl mx-auto space-y-4">
            <textarea
              className="w-full bg-card border border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary/50 text-right"
              placeholder="(اسم المنتج، السعر، العرض...)"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              data-testid="input-product"
            />
            <div className="flex gap-3">
              <select
                className="flex-1 bg-card border border-border rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={dialect}
                onChange={(e) => setDialect(e.target.value as any)}
                data-testid="select-dialect"
              >
                <option value="غربية">اللهجة الغربية</option>
                <option value="شرقية">اللهجة الشرقية</option>
                <option value="جنوبية">اللهجة الجنوبية</option>
              </select>
              <button
                onClick={handleGenerateText}
                disabled={textLoading}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                data-testid="button-generate-text"
              >
                {textLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                ولّد النص
              </button>
            </div>
            {generatedText && (
              <div className="relative bg-card border border-border rounded-xl p-4 pb-12" data-testid="text-generated-result">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{generatedText}</p>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between border-t border-border pt-2 mt-2">
                  <p className="text-xs text-muted-foreground">متوافق مع سياسات Meta</p>
                  <button
                    onClick={() => copyToClipboard(generatedText, setCopiedText)}
                    className="flex items-center gap-1.5 text-xs bg-muted text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors"
                    data-testid="button-copy-text"
                  >
                    {copiedText ? <><Check className="w-3 h-3 text-green-400" /> تم النسخ</> : <><Copy className="w-3 h-3" /> نسخ النص</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 3. How it works */}
        <section id="how" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">كيف يعمل؟</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "ارفع الإعلان", desc: "اسحب وأفلت صورة PNG/JPG أو فيديو MP4 في مربع الرفع" },
              { step: "02", title: "تحليل فوري خلال 8 ثوانٍ", desc: "الذكاء الاصطناعي يفحص كل فريم مقارنةً بسياسات Meta وTikTok" },
              { step: "03", title: "نتيجة واضحة", desc: "تحصل على حكم نهائي مع نقاط تفصيلية وسبب واضح" },
            ].map((s) => (
              <div key={s.step} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                <span className="text-4xl font-black text-primary/30">{s.step}</span>
                <h3 className="text-lg font-bold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Why PostLapAI */}
        <section id="why" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">لماذا PostLapAI؟</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: <Shield className="w-6 h-6 text-primary" />, title: "دقة عالية", desc: "ذكاء اصطناعي متخصص في سياسات الإعلانات يعطيك حكماً دقيقاً قبل النشر" },
              { icon: <Eye className="w-6 h-6 text-primary" />, title: "فحص الفيديو فريم بفريم", desc: "نقطع الفيديو ونفحص كل ثانية على حدة — لا شيء يفوتنا" },
              { icon: <Lock className="w-6 h-6 text-primary" />, title: "خصوصية تامة", desc: "ملفاتك تُحذف فور التحليل. لا تخزين، لا مشاركة مع طرف ثالث" },
              { icon: <CheckCircle className="w-6 h-6 text-primary" />, title: "توليد نصوص ليبية", desc: "اكتب بالليبي الأصيل — شرقي، غربي، أو جنوبي — ومتوافق مع سياسات المنصات" },
            ].map((f) => (
              <div key={f.title} className="bg-card border border-border rounded-2xl p-5 flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">{f.icon}</div>
                <div>
                  <h3 className="font-bold text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Trust badges */}
        <section className="flex flex-wrap justify-center gap-3">
          {["آمن 100%", "لا نخزن إعلاناتك", "متوافق مع Meta & TikTok", "نتيجة خلال 8 ثوانٍ"].map((b) => (
            <div key={b} className="flex items-center gap-2 border border-border rounded-full px-4 py-2 bg-card text-xs sm:text-sm text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0" />
              {b}
            </div>
          ))}
        </section>

        {/* 6. Stats */}
        {stats && (
          <section className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: "إجمالي الفحوصات", value: stats.total_checks },
              { label: "المستخدمون", value: stats.total_users },
              { label: "فحوصات اليوم", value: stats.checks_today },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-4 sm:p-5 text-center">
                <p className="text-2xl sm:text-3xl font-black text-primary">{s.value.toLocaleString("ar")}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </section>
        )}

        {/* 7. Agents */}
        <section id="agents" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">الوكلاء المعتمدون</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {agentsList.map((a) => (
              <div
                key={a.country}
                className="border border-primary/30 rounded-2xl p-6 bg-card flex flex-col gap-3"
                data-testid={`card-agent-${a.country}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{a.flag}</span>
                  <div>
                    <h3 className="font-bold text-foreground leading-tight">{a.country}</h3>
                    <span className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5">نشط</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{a.company}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{a.address}</p>
                </div>
                <a
                  href={`https://wa.me/${a.wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  data-testid={`link-agent-wa-${a.country}`}
                >
                  <span>واتساب:</span>
                  <span dir="ltr">+{a.wa}</span>
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* 8. FAQ */}
        <section id="faq" className="w-full max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">الأسئلة الشائعة</h2>
          <div className="space-y-2">
            {faqs.map((f, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden bg-card" data-testid={`faq-item-${i}`}>
                <button
                  className="w-full text-right px-5 py-4 flex justify-between items-center text-foreground font-semibold hover:bg-muted/50 transition-colors text-sm sm:text-base"
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  data-testid={`button-faq-${i}`}
                >
                  {f.q}
                  <span className="text-muted-foreground text-lg shrink-0 mr-2">{faqOpen === i ? "−" : "+"}</span>
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 9. Pricing Plans — LAST */}
        <section id="plans" className="w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-foreground mb-2">اختر خطتك</h2>
            <p className="text-muted-foreground text-sm">ابدأ مجاناً — طوّر خطتك متى شئت</p>
            {discountActive && (
              <div className="inline-flex items-center gap-2 mt-3 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-sm font-bold px-4 py-2 rounded-full">
                🔥 خصم 50% حصري — عرض مايو ويونيو 2026 فقط!
              </div>
            )}
          </div>

          {/* Free tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="border border-border rounded-2xl p-5 bg-card flex flex-col gap-3">
              <h3 className="font-bold text-foreground">زائر — مجاني</h3>
              <p className="text-muted-foreground text-sm">3 فحوصات مجانية بدون تسجيل</p>
              <div className="text-xs text-muted-foreground border border-border rounded-lg p-2 text-center">
                متبقي: {user ? (user.plan !== "professional" ? user.trials_remaining : "غير محدود") : getTrials()} محاولة
              </div>
            </div>
            <div className="border border-primary/30 rounded-2xl p-5 bg-primary/5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground">مسجل بجوجل — مجاني</h3>
                <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">الأفضل</span>
              </div>
              <p className="text-muted-foreground text-sm">6 فحوصات يومياً وحفظ السجل</p>
              {user ? (
                <p className="text-sm text-primary font-semibold text-center">✓ مسجل الدخول</p>
              ) : (
                <div ref={googleBtnRef} className="flex justify-center" data-testid="button-google-signin" />
              )}
            </div>
          </div>

          {/* Paid plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const discountedPrice = discountActive ? plan.price * 0.5 : null;
              return (
                <div
                  key={plan.id}
                  className={`border rounded-2xl p-6 flex flex-col gap-4 ${plan.highlight ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
                  data-testid={`card-plan-${plan.id}`}
                >
                  {plan.badge && (
                    <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full self-start">{plan.badge}</span>
                  )}
                  <div>
                    <h3 className="text-lg font-black text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{plan.nameAr}</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      {discountActive ? (
                        <>
                          <span className="text-3xl font-black text-primary">{discountedPrice} د.ل</span>
                          <span className="text-lg text-muted-foreground line-through">{plan.price} د.ل</span>
                        </>
                      ) : (
                        <span className="text-3xl font-black text-foreground">{plan.price} د.ل</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">شهرياً — {plan.desc}</p>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`أريد الاشتراك في ${plan.name} - PostLapAI`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full text-center py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity block ${
                      plan.highlight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground border border-border"
                    }`}
                    data-testid={`button-plan-${plan.id}`}
                  >
                    {plan.cta}
                  </a>
                  {discountActive && (
                    <p className="text-xs text-center text-yellow-400">🔥 ادفع {discountedPrice} د.ل فقط هذا الشهر</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">نقبل الدفع بالتحويل المصرفي</p>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-10 bg-card">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div>
              <p className="text-xl font-black text-primary">PostLapAI</p>
              <p className="text-sm text-muted-foreground mt-1">أداة فحص الإعلانات بالذكاء الاصطناعي للمنصات الإعلانية</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">سياسة الخصوصية</a>
              <a href="#" className="hover:text-foreground transition-colors">الشروط والأحكام</a>
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">تواصل معنا</a>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-6 text-center">© 2025 PostLapAI. جميع الحقوق محفوظة.</p>
        </div>
      </footer>

      {/* Trial block modal */}
      {trialBlockModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="modal-trial-block">
          <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground leading-relaxed">
              سادك هكي يا غالي! جربت النظام وشفت الفلاحة.. لو تبي تكمل وتفحص كميات أكبر، سجل الدخول بس.
            </p>
            <div className="space-y-3">
              <div ref={googleBtnModalRef} className="flex justify-center" />
              <a
                href={`https://wa.me/${whatsapp}?text=أريد الاشتراك في Smart Fix - PostLapAI`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                data-testid="button-modal-subscribe"
              >
                اشترك في Smart Fix — {discountActive ? "200" : "400"} د.ل
              </a>
              <button
                onClick={() => setTrialBlockModal(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-modal-close"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gender selection modal */}
      {genderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="modal-gender">
          <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center space-y-6">
            <div>
              <p className="text-xl font-black text-foreground">مرحباً بك! 👋</p>
              <p className="text-sm text-muted-foreground mt-2">
                حتى نقدر نخاطبك صح، حدد جنسك
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => saveGender("male")}
                className="flex-1 border border-border rounded-2xl p-5 text-center hover:border-primary/50 hover:bg-primary/5 transition-all"
                data-testid="button-gender-male"
              >
                <p className="text-3xl mb-2">👨</p>
                <p className="font-bold text-foreground">ذكر</p>
              </button>
              <button
                onClick={() => saveGender("female")}
                className="flex-1 border border-border rounded-2xl p-5 text-center hover:border-primary/50 hover:bg-primary/5 transition-all"
                data-testid="button-gender-female"
              >
                <p className="text-3xl mb-2">👩</p>
                <p className="font-bold text-foreground">أنثى</p>
              </button>
            </div>
            <button
              onClick={() => setGenderModal(false)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              تخطى
            </button>
          </div>
        </div>
      )}

      {/* Cookie consent */}
      {!cookieConsent && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border p-4 flex flex-col sm:flex-row items-center justify-between gap-3" data-testid="banner-cookie">
          <p className="text-sm text-muted-foreground">نستخدم الكوكيز لتحسين تجربتك على PostLapAI</p>
          <button
            onClick={acceptCookies}
            className="bg-primary text-primary-foreground text-sm px-5 py-2 rounded-xl font-semibold hover:opacity-90 transition-opacity shrink-0"
            data-testid="button-accept-cookies"
          >
            موافق
          </button>
        </div>
      )}

      {/* Hamzawi Chat */}
      <HamzawiChat
        gender={gender}
        checkResult={checkResult}
        whatsapp={whatsapp}
      />
    </div>
  );
}
