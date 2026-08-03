import { useState, useRef, useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, Loader2, Copy, Check, Shield, Eye, Lock, ScanLine, Image as ImageIcon, Download, Store } from "lucide-react";
import { useGetConfig, useGetStats, getGetConfigQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import HamzawiChat from "@/components/HamzawiChat";
import { useLanguage } from "@/lib/useLanguage";
import { ui } from "@/lib/i18n";
import { handleAuthError as authError, clearAuth as clearAuthState } from "@/lib/utils";

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
  brand_onboarded?: boolean;
  brand_profile_complete?: boolean;
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

// Plan level mapping (mirrors backend planLevel() in lib/db/src/schema/users.ts)
// visitor=1, registered=2, professional=3(legacy), smart_fix=3, content=4, agency=5
function planLevelFrontend(plan: string): number {
  const levels: Record<string, number> = {
    visitor: 1, registered: 2, professional: 3, smart_fix: 3, content: 4, agency: 5,
  };
  return levels[plan] ?? 1;
}

function isDiscountActive(): boolean {
  return false;
}

export default function Home() {
  const { toast } = useToast();
  const { data: config } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });
  const { lang } = useLanguage();
  const t = ui[lang];

  const [user, setUser] = useState<LocalUser | null>(getStoredUser);
  const heroFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [checkResult, setCheckResult] = useState<{ id?: number; status: CheckStatus; message: string; score: number; frames_checked?: number | null; violations?: Array<{ type: string; reason: string; severity: string }>; suggestions?: string[] } | null>(null);
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [trialBlockModal, setTrialBlockModal] = useState(false);
  const [genderModal, setGenderModal] = useState(false);
  const [product, setProduct] = useState("");
  const [dialect, setDialect] = useState<"شرقية" | "غربية" | "جنوبية">("غربية");
  const [generatedText, setGeneratedText] = useState("");
  const [copiedText, setCopiedText] = useState(false);
  const [cookieConsent, setCookieConsent] = useState(() => !!localStorage.getItem(COOKIE_KEY));
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [imageProduct, setImageProduct] = useState("");
  const [imageProductName, setImageProductName] = useState("");
  const [imageGenLoading, setImageGenLoading] = useState(false);
  const [imageGenResult, setImageGenResult] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [subscribeModal, setSubscribeModal] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [userRefreshed, setUserRefreshed] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const googleBtnModalRef = useRef<HTMLDivElement>(null);
  const googleBtnLoginModalRef = useRef<HTMLDivElement>(null);

  const gender = (user?.gender ?? localStorage.getItem(GENDER_KEY) ?? null) as "male" | "female" | null;
  const discountActive = isDiscountActive();

  function handleHeroFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleFile(file);
  }

  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
    });
    if (googleBtnRef.current) {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline", size: "large", text: "signin_with", locale: "ar",
      });
    }
    if (googleBtnModalRef.current) {
      window.google.accounts.id.renderButton(googleBtnModalRef.current, {
        theme: "outline", size: "large", text: "signin_with", locale: "ar",
      });
    }
  }, [googleBtnRef.current, googleBtnModalRef.current]);

  useEffect(() => {
    if (!showLoginModal) return;
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;
    if (!window.google?.accounts?.id) return;
    // Re-initialize to ensure callback is fresh, then render into login modal
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
    });
    if (googleBtnLoginModalRef.current) {
      window.google.accounts.id.renderButton(googleBtnLoginModalRef.current, {
        theme: "outline", size: "large", text: "signin_with", locale: "ar",
      });
    }
  }, [showLoginModal, googleBtnLoginModalRef.current]);

  useEffect(() => {
    if (!trialBlockModal) return;
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) return;
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
    });
    if (googleBtnModalRef.current) {
      window.google.accounts.id.renderButton(googleBtnModalRef.current, {
        theme: "outline", size: "large", text: "signin_with", locale: "ar",
      });
    }
  }, [trialBlockModal, googleBtnModalRef.current]);

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
      setShowLoginModal(false);
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
      const res = await fetch("/api/users/me/gender", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gender: g }),
      });
      if (authError(res)) { logout(); return; }
      if (!res.ok) return;
      if (user) {
        const updated = { ...user, gender: g };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);
      }
    } catch {
      console.error("Failed to save gender");
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    toast({ title: "تم تسجيل الخروج" });
  }

  // First-time onboarding gate: users on Professional (content, level 4+) whose
  // brand profile is not complete are sent to /onboarding. Uses the server-computed
  // brand_profile_complete (flag + core-data check) so a lost flag never forces re-onboarding.
  // Runs only AFTER the mount refresh completes so a stale localStorage user (with the old
  // brand_profile_complete=false) never re-redirects back to /onboarding after setup is done.
  useEffect(() => {
    if (!user || !userRefreshed) return;
    if (planLevelFrontend(user.plan) >= 4 && user.brand_profile_complete === false) {
      if (window.location.pathname !== "/onboarding") {
        window.location.href = "/onboarding";
      }
    }
  }, [user, userRefreshed]);

  // Refresh user from server on mount so brand_profile_complete is always current
  // (even if localStorage is stale from an older session). The gate effect above only
  // runs after this settles, so a stale flag never causes a redirect loop.
  useEffect(() => {
    const token = getToken();
    if (!token || !user) {
      setUserRefreshed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.status === 401) {
          logout();
          return;
        }
        if (res.ok) {
          const fresh = await res.json();
          localStorage.setItem(USER_KEY, JSON.stringify(fresh));
          setUser(fresh);
        }
      } catch {
        // ignore network errors — keep local state
      } finally {
        if (!cancelled) setUserRefreshed(true);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      const token = getToken();
      if (!token) {
        setSubscribeModal(false);
        setShowLoginModal(true);
        return;
      }
      const res = await fetch("/api/auth/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { logout(); toast({ title: "انتهت الجلسة", variant: "destructive" }); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل الاشتراك");
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      setSubscribeModal(false);
      toast({ title: "تم الاشتراك في Professional 🎉", description: "فعّلنا خطة Professional (800 د.ل/شهر) — جهّز نشاطك التجاري الآن" });
      window.location.href = "/onboarding";
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubscribing(false);
    }
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
    } else if (["visitor", "registered"].includes(user.plan) && user.trials_remaining <= 0) {
      setTrialBlockModal(true); return;
    }

    // Store base64 (images only) for level-4 image+description post generation
    if (file.type !== "video/mp4") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        setUploadedImageBase64(typeof result === "string" ? result : null);
      };
      reader.readAsDataURL(file);
    } else {
      setUploadedImageBase64(null);
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
      if (res.status === 401) { logout(); toast({ title: "انتهت الجلسة", variant: "destructive" }); return; }
      if (!res.ok) {
        toast({ title: "خطأ", description: data.error, variant: "destructive" });
        return;
      }
      setCheckResult(data);
      if (!user) decrementTrials();
    } catch {
      stopCountdown();
      setChecking(false);
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  }


  async function handleGenerateText() {
    if (!product.trim()) { toast({ title: "أدخل معلومات المنتج", variant: "destructive" }); return; }
    setTextLoading(true);
    const token = localStorage.getItem(TOKEN_KEY);
    const userLevel = user ? planLevelFrontend(user.plan) : 0;
    try {
      const body: Record<string, string> = { product, dialect };
      // Level 4+ (content/agency): include the uploaded image for richer post generation
      if (userLevel >= 4 && uploadedImageBase64) {
        body.imageBase64 = uploadedImageBase64;
      }
      const res = await fetch("/api/generate-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) { logout(); toast({ title: "انتهت الجلسة", variant: "destructive" }); return; }
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

  function handleImageProductFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImageProductName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImageBase64(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  function downloadImage(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `postlap-post-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleGenerateImage() {
    if (!imageProduct.trim()) { toast({ title: "أدخل معلومات المنتج", variant: "destructive" }); return; }
    setImageGenLoading(true);
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      const body: Record<string, string> = { mode: "new_post", productDescription: imageProduct };
      if (uploadedImageBase64) body.productImageBase64 = uploadedImageBase64;
      const res = await fetch("/api/image-gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) { logout(); toast({ title: "انتهت الجلسة", variant: "destructive" }); return; }
      if (!res.ok) throw new Error(data.error);
      setImageGenResult(data.url);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setImageGenLoading(false);
    }
  }

  function acceptCookies() {
    localStorage.setItem(COOKIE_KEY, "1");
    setCookieConsent(true);
  }


  const faqs = [
    { q: "كيف يعمل PostLapAI؟", a: "ارفع صورة أو فيديو إعلانك، يحللها الذكاء الاصطناعي مقارنةً بسياسات Meta وTikTok ويعطيك نتيجة فورية." },
    { q: "هل نتائج الفحص دقيقة 100%؟", a: "الدقة 90% لأن سياسات المنصات تتحدث باستمرار. النتيجة مساعدة لكنها لا تضمن قبول المنصة." },
    { q: "هل تخزنون إعلاناتنا؟", a: "لا، نحذف جميع الملفات فور انتهاء التحليل. لا نخزن محتواك أبداً." },
    { q: "ما الفرق بين الخطط؟", a: "Smart Fix للإصلاح الفوري، إدارة المحتوى للشركات، وخطة الوكالة للمكاتب والمشاريع المتعددة." },
    { q: "كيف أشترك؟", a: "تواصل معنا عبر واتساب وأرسل اسم الخطة التي تريدها. نقبل الدفع بالتحويل المصرفي." },
    { q: "هل يدعم فيديوهات تيك توك؟", a: "نعم، نقبل ملفات MP4. يُرفع الفيديو ويُحلل فريم بفريم وفق سياسات Meta وTikTok." },
  ];

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
    <div className="min-h-screen bg-background text-foreground" dir={t.dir}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-black/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-primary tracking-tight">PostLap<span className="text-foreground">AI</span></span>
            <span className="hidden sm:inline text-xs text-muted-foreground border border-border rounded px-2 py-0.5">فحص الإعلانات</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#generate" className="hover:text-foreground transition-colors">{lang === "ar" ? "توليد المنشورات" : "Post Generation"}</a>
            <a href="#image-gen" className="hover:text-foreground transition-colors">{lang === "ar" ? "توليد الصور" : "Image Generation"}</a>
            <a href="#check" className="hover:text-foreground transition-colors">{lang === "ar" ? "فحص الإعلانات" : "Ad Check"}</a>
            <a href="#plans" className="hover:text-foreground transition-colors">{lang === "ar" ? "الخطط" : "Plans"}</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${["professional","smart_fix","content","agency"].includes(user.plan) ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                  {user.plan === "agency" ? "وكالة" : user.plan === "content" ? "Professional" : user.plan === "smart_fix" || user.plan === "professional" ? "Smart Fix" : user.plan === "registered" ? "مسجل" : "زائر"}
                </span>
                <a
                  href="/brand"
                  title="هوية النشاط التجاري"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  data-testid="link-brand-settings"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">هوية النشاط</span>
                </a>
                <button onClick={logout} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t.nav.signOut}</button>
              </div>
            ) : (
              <button onClick={() => setShowLoginModal(true)} className="text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors" data-testid="button-header-signin">
                {t.nav.signIn}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-16">

        {/* ── 1. HERO: AI Post Generation ─────────────────────────────────── */}
        <section id="generate" className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left: headline + text generator */}
            <div className="space-y-6">
              <div className="text-center lg:text-right space-y-3">
                <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {lang === "ar" ? "توليد المنشورات بالذكاء الاصطناعي" : "AI Post Generation"}
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-foreground leading-tight">
                  {lang === "ar" ? (
                    <>ولّد منشورك الإعلاني مع <span className="text-primary">حمزاوي</span></>
                  ) : (
                    <>Generate your ad post with <span className="text-primary">Hamzawi</span></>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed">
                  {lang === "ar"
                    ? "نصوص ليبية أصيلة متوافقة مع سياسات Meta — وصف المنتج، السعر، والعرض. وارفق صورة المنتج لنتيجة أدق"
                    : "Authentic Libyan ad copy that complies with Meta's policies. Describe your product and attach an image for sharper results"}
                </p>
              </div>

              {user && planLevelFrontend(user.plan) >= 3 ? (
                /* Smart Fix+ users (level 3+) — full text generator; level 4+ gets image+description mode */
                <div className="space-y-4">
                  {planLevelFrontend(user.plan) >= 4 && uploadedImageBase64 && (
                    <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                      <ScanLine className="w-3.5 h-3.5 shrink-0" />
                      <span>سيتم استخدام صورة الإعلان المرفوعة لإنشاء منشور أكثر دقة وتخصيصاً</span>
                    </div>
                  )}
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
                        <p className="text-xs text-muted-foreground">متوافق مع سياسات Meta ✓</p>
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
              ) : (
                /* Non-paid / non-logged users — gated prompt */
                <div className="bg-card border border-primary/20 rounded-2xl p-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                    <Lock className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-black text-foreground">
                      {!user ? "سجّل الدخول مجاناً للوصول" : "ميزة للمشتركين المدفوعين"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {!user
                        ? "سجل دخولك مجاناً وشوف تحليل الرفض التفصيلي — توليد النصوص الإعلانية يتطلب خطة مدفوعة."
                        : <>توليد نصوص إعلانية بالليبي الأصيل متاح لخطط <span className="text-primary font-semibold">Smart Fix</span> وما فوق.</>}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {!user ? (
                      <>
                        <div ref={googleBtnRef} className="flex justify-center" data-testid="button-google-signin-generate" />
                        <button onClick={() => setShowLoginModal(true)} className="border border-border text-muted-foreground px-6 py-2.5 rounded-xl text-sm hover:bg-muted/50 transition-colors" data-testid="button-register-free">
                          سجّل مجاناً
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setSubscribeModal(true)}
                          className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                          data-testid="button-subscribe-start"
                        >
                          اشترك وابدأ التوليد
                        </button>
                        <a href="#plans" className="border border-border text-muted-foreground px-6 py-2.5 rounded-xl text-sm hover:bg-muted/50 transition-colors">
                          عرض الخطط
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: embedded functional Hamzawi assistant */}
            <div className="lg:sticky lg:top-24">
              <HamzawiChat
                embedded
                gender={gender}
                checkResult={checkResult}
                whatsapp={whatsapp}
                userPlan={user?.plan}
                onFileCheck={handleFile}
                checking={checking}
              />
            </div>
          </div>
        </section>

        {/* ── 2. AI Image Generation ──────────────────────────────────────── */}
        <section id="image-gen" className="w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-foreground mb-2">
              {lang === "ar" ? "توليد صور المنشورات" : "AI Image Generation"}
            </h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
              {lang === "ar"
                ? "صمم منشوراً احترافياً بشعار نشاطك وألوان هويتك من وصف منتجك مباشرةً"
                : "Design a professional post with your brand's logo and colors directly from your product description"}
            </p>
          </div>

          {user && planLevelFrontend(user.plan) >= 4 ? (
            <div className="max-w-2xl mx-auto space-y-4">
              {uploadedImageBase64 && (
                <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{lang === "ar" ? "سيتم استخدام صورة المنتج المرفوعة في التصميم" : "The uploaded product image will be used in the design"}</span>
                </div>
              )}
              <textarea
                className="w-full bg-card border border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary/50 text-right"
                placeholder={lang === "ar" ? "(اسم المنتج، السعر، العرض...)" : "(product name, price, offer...)"}
                value={imageProduct}
                onChange={(e) => setImageProduct(e.target.value)}
                data-testid="input-image-product"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <input ref={imageFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageProductFile} />
                <button
                  onClick={() => imageFileInputRef.current?.click()}
                  className="flex-1 bg-muted border border-dashed border-border rounded-xl px-4 py-2.5 text-sm text-muted-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                >
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{imageProductName || (lang === "ar" ? "ارفع صورة المنتج (اختياري)" : "Upload product image (optional)")}</span>
                </button>
                <button
                  onClick={handleGenerateImage}
                  disabled={imageGenLoading}
                  className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50 justify-center"
                  data-testid="button-generate-image"
                >
                  {imageGenLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {lang === "ar" ? "ولّد الصورة" : "Generate Image"}
                </button>
              </div>
              {imageGenResult && (
                <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="image-generated-result">
                  <img src={imageGenResult} alt="generated post" className="w-full" />
                  <div className="flex items-center justify-between p-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">{lang === "ar" ? "متوافق مع سياسات Meta ✓" : "Compliant with Meta policies ✓"}</p>
                    <button
                      onClick={() => downloadImage(imageGenResult)}
                      className="flex items-center gap-1.5 text-xs bg-muted text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors"
                      data-testid="button-download-image"
                    >
                      <Download className="w-3 h-3" /> {lang === "ar" ? "حمّل الصورة" : "Download"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Non-paid / non-logged users — gated prompt */
            <div className="max-w-xl mx-auto bg-card border border-primary/20 rounded-2xl p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <ImageIcon className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-lg font-black text-foreground">
                  {!user ? "سجّل الدخول مجاناً للوصول" : "ميزة للمشتركين المدفوعين"}
                </p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {!user
                    ? "سجل دخولك مجاناً — توليد صور المنشورات متاح لخطط إدارة المحتوى والوكالة."
                    : <>توليد صور المنشورات بالشعار والهوية متاح لخطط <span className="text-primary font-semibold">إدارة المحتوى</span> وما فوق.</>}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {!user ? (
                  <>
                    <div ref={googleBtnModalRef} className="flex justify-center" />
                    <button onClick={() => setShowLoginModal(true)} className="border border-border text-muted-foreground px-6 py-2.5 rounded-xl text-sm hover:bg-muted/50 transition-colors" data-testid="button-register-free-image">
                      سجّل مجاناً
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setSubscribeModal(true)}
                      className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                      data-testid="button-subscribe-start-image"
                    >
                      اشترك وابدأ التوليد
                    </button>
                    <a href="#plans" className="border border-border text-muted-foreground px-6 py-2.5 rounded-xl text-sm hover:bg-muted/50 transition-colors">
                      عرض الخطط
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── 3. Existing Post Check ──────────────────────────────────────── */}
        <section id="check" className="w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-foreground mb-2">
              {lang === "ar" ? "افحص إعلانك الحالي" : "Check Your Existing Ad"}
            </h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
              {lang === "ar"
                ? "ارفع صورة أو فيديو إعلانك واحصل على تقييم المخاطر ونقاط الامتثال فوراً"
                : "Upload your ad image or video and get a risk assessment and compliance score instantly"}
            </p>
          </div>

          <div className="max-w-xl mx-auto">
            <input
              ref={heroFileInputRef}
              type="file"
              accept="image/png,image/jpeg,video/mp4"
              className="hidden"
              onChange={handleHeroFileUpload}
            />
            <button
              onClick={() => heroFileInputRef.current?.click()}
              disabled={checking}
              className="w-full bg-card border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-primary/50 transition-colors disabled:opacity-70"
              data-testid="dropzone-check"
            >
              {checking ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground animate-pulse">
                    {lang === "ar" ? "جاري تحليل إعلانك..." : "Analyzing your ad..."}
                    {countdown !== null && <span className="ml-2">{countdown}s</span>}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <ScanLine className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-black text-foreground">
                      {lang === "ar" ? "ارفع إعلانك للفحص" : "Upload your ad to check"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {lang === "ar" ? "صورة PNG / JPG أو فيديو MP4 — حتى 50 ميجابايت" : "PNG / JPG image or MP4 video — up to 50 MB"}
                    </p>
                  </div>
                </div>
              )}
            </button>

            {checkResult && !checking && (
              <div className="mt-6 bg-card border border-border rounded-2xl overflow-hidden" data-testid="inline-check-result">
                <div className={`p-5 border-b border-border flex items-center justify-between gap-3 ${checkResult.status === "ممتاز" ? "bg-green-500/10" : checkResult.status === "مرفوض" ? "bg-red-500/10" : "bg-yellow-500/10"}`}>
                  <div className="flex items-center gap-2">
                    {checkResult.status === "ممتاز" ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : checkResult.status === "مرفوض" ? (
                      <XCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                    )}
                    <p className="font-bold text-foreground">{checkResult.status}</p>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">{lang === "ar" ? "النقاط:" : "Score:"}</span>{" "}
                    <span className="font-black text-primary text-lg">{checkResult.score}</span>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  {checkResult.message && (
                    <p className="text-sm text-foreground leading-relaxed">{checkResult.message}</p>
                  )}
                  {checkResult.violations && checkResult.violations.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground mb-2">{lang === "ar" ? "المخالفات" : "Violations"}</p>
                      <ul className="space-y-2">
                        {checkResult.violations.map((v, i) => (
                          <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                            <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                            <span>{v.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {checkResult.suggestions && checkResult.suggestions.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground mb-2">{lang === "ar" ? "الاقتراحات" : "Suggestions"}</p>
                      <ul className="space-y-2">
                        {checkResult.suggestions.map((s, i) => (
                          <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                            <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-400" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(!user || ["visitor", "registered"].includes(user.plan)) && (
                    <a
                      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(lang === "ar" ? "أريد الاشتراك في Smart Fix" : "I want to subscribe to Smart Fix")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="block w-full bg-green-600 text-white text-center text-sm py-2.5 rounded-xl font-bold hover:bg-green-700 transition-colors"
                    >
                      📲 {lang === "ar" ? "اشترك في Smart Fix للتحليل التفصيلي" : "Subscribe to Smart Fix for detailed analysis"}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── 4. Features ─────────────────────────────────────────────────── */}
        <section id="why" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-2">لماذا PostLapAI؟</h2>
          <p className="text-center text-muted-foreground text-sm mb-10">كل ما تحتاجه لإعلانات أذكى وأأمن</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <Shield className="w-5 h-5 text-primary" />, title: "تحليل فوري", desc: "نتيجة خلال 8 ثوانٍ بدون انتظار" },
              { icon: <Eye className="w-5 h-5 text-primary" />, title: "كشف بالذكاء الاصطناعي", desc: "يفحص النص والمرئيات معاً بدقة عالية" },
              { icon: <CheckCircle className="w-5 h-5 text-primary" />, title: "نقاط الامتثال الإعلاني", desc: "تقرير واضح بنقاط القوة والضعف في إعلانك" },
              { icon: <AlertCircle className="w-5 h-5 text-primary" />, title: "تقييم المخاطر", desc: "اعرف احتمالية رفض إعلانك قبل ما تصرف فلوساً" },
              { icon: <Lock className="w-5 h-5 text-primary" />, title: "خصوصية تامة", desc: "ملفاتك تُحذف فور التحليل — لا تخزين أبداً" },
              { icon: <CheckCircle className="w-5 h-5 text-primary" />, title: "دعم متعدد اللهجات", desc: "نصوص ليبية أصيلة — شرقية، غربية، وجنوبية" },
            ].map((f) => (
              <div key={f.title} className="bg-card border border-border rounded-2xl p-5 flex gap-3 hover:border-primary/30 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">{f.icon}</div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">{f.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. Pricing ──────────────────────────────────────────────────── */}
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

          {/* Paid plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {plans.map((plan) => {
              const discountedPrice = discountActive ? plan.price * 0.5 : null;
              const isContentMgmt = plan.id === "content_mgmt";
              return (
                <div
                  key={plan.id}
                  className={`relative border rounded-2xl flex flex-col gap-4 overflow-hidden ${
                    isContentMgmt
                      ? "border-primary bg-gradient-to-b from-primary/10 to-primary/5 shadow-xl shadow-primary/10 scale-[1.02] p-7"
                      : "border-border bg-card p-6"
                  }`}
                  data-testid={`card-plan-${plan.id}`}
                >
                  {/* Content Mgmt glow ring */}
                  {isContentMgmt && (
                    <div className="absolute inset-0 rounded-2xl ring-1 ring-primary/40 pointer-events-none" />
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className={`font-black ${isContentMgmt ? "text-xl text-primary" : "text-lg text-foreground"}`}>{plan.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{plan.nameAr}</p>
                    </div>
                    {plan.badge && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${isContentMgmt ? "bg-primary text-white" : "bg-muted text-muted-foreground border border-border"}`}>
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-baseline gap-2">
                      {discountActive ? (
                        <>
                          <span className={`font-black ${isContentMgmt ? "text-4xl text-primary" : "text-3xl text-foreground"}`}>{discountedPrice} <span className="text-lg">د.ل</span></span>
                          <span className="text-base text-muted-foreground line-through">{plan.price}</span>
                        </>
                      ) : (
                        <span className={`font-black ${isContentMgmt ? "text-4xl text-primary" : "text-3xl text-foreground"}`}>{plan.price} <span className="text-lg">د.ل</span></span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">شهرياً — {plan.desc}</p>
                    {discountActive && (
                      <p className="text-xs text-yellow-400 font-semibold mt-1">🔥 خصم 50% — ادفع {discountedPrice} د.ل فقط</p>
                    )}
                  </div>

                  <ul className="space-y-2.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2 text-sm">
                        <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${isContentMgmt ? "text-primary" : "text-primary/70"}`} />
                        <span className={isContentMgmt ? "text-foreground font-medium" : "text-muted-foreground"}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`أريد الاشتراك في ${plan.name} - PostLapAI`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full text-center py-3 rounded-xl font-black text-sm hover:opacity-90 transition-all block ${
                      isContentMgmt
                        ? "bg-primary text-white shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01]"
                        : "bg-muted text-foreground border border-border hover:border-primary/40"
                    }`}
                    data-testid={`button-plan-${plan.id}`}
                  >
                    {plan.cta}
                  </a>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">نقبل الدفع بالتحويل المصرفي</p>
        </section>

        {/* ── 6. Secondary: How it works ──────────────────────────────────── */}
        <section id="how" className="w-full opacity-90">
          <h2 className="text-xl font-bold text-center text-muted-foreground mb-2">كيف يعمل؟</h2>
          <p className="text-center text-muted-foreground text-xs mb-8">ثلاث خطوات بسيطة — نتيجة في ثوانٍ</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {[
              { step: "01", emoji: "📤", title: "ارفع الإعلان", desc: "اسحب وأفلت صورتك أو فيديو MP4 مباشرةً في منطقة الرفع" },
              { step: "02", emoji: "🤖", title: "الذكاء الاصطناعي يحلّل", desc: "يفحص النصوص والمرئيات فريم بفريم وفق سياسات Meta وTikTok" },
              { step: "03", emoji: "📊", title: "نتائج فورية", desc: "تحصل على تقييم المخاطر، نقاط الامتثال، ونصائح التحسين" },
            ].map((s) => (
              <div key={s.step} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 relative">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="text-xs font-black text-primary/40 bg-primary/5 border border-primary/10 px-2 py-0.5 rounded-full">خطوة {s.step}</span>
                </div>
                <h3 className="text-base font-bold text-foreground">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. Secondary: Trust badges ──────────────────────────────────── */}
        <section className="flex flex-wrap justify-center gap-3 opacity-80">
          {[
            { label: "آمن 100%", emoji: "🔒" },
            { label: "لا نخزن إعلاناتك", emoji: "🗑️" },
            { label: "متوافق مع Meta & TikTok", emoji: "✅" },
            { label: "نتيجة خلال 8 ثوانٍ", emoji: "⚡" },
            { label: "دعم متعدد اللهجات", emoji: "🗣️" },
          ].map((b) => (
            <div key={b.label} className="flex items-center gap-2 border border-border rounded-full px-4 py-1.5 bg-card text-xs text-muted-foreground hover:border-primary/30 transition-colors">
              <span>{b.emoji}</span>
              {b.label}
            </div>
          ))}
        </section>

        {/* ── 8. Secondary: Stats ─────────────────────────────────────────── */}
        {stats && (
          <section className="grid grid-cols-3 gap-3 sm:gap-4 opacity-80">
            {[
              { label: "إجمالي الفحوصات", value: stats.total_checks ?? 0 },
              { label: "المستخدمون", value: stats.total_users ?? 0 },
              { label: "فحوصات اليوم", value: stats.checks_today ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-4 sm:p-5 text-center">
                <p className="text-2xl sm:text-3xl font-black text-primary">{s.value.toLocaleString("ar")}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </section>
        )}

        {/* ── 9. Secondary: Agents ────────────────────────────────────────── */}
        <section id="agents" className="w-full opacity-90">
          <h2 className="text-xl font-bold text-center text-muted-foreground mb-8">الوكلاء المعتمدون</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {agentsList.map((a) => (
              <div
                key={a.country}
                className="border border-primary/30 rounded-2xl p-6 bg-card flex flex-col gap-3"
                data-testid={`card-agent-${a.country}`}
              >
                <div className="flex items-center gap-2" dir="ltr">
                  <span style={{ fontSize: "24px", lineHeight: 1 }}>{a.flag}</span>
                  <div dir="rtl">
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

        {/* ── 10. Secondary: FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="w-full max-w-2xl mx-auto opacity-90">
          <h2 className="text-xl font-bold text-center text-muted-foreground mb-8">الأسئلة الشائعة</h2>
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
              <a href="/privacy" className="hover:text-foreground transition-colors">سياسة الخصوصية</a>
              <a href="/terms" className="hover:text-foreground transition-colors">الشروط والأحكام</a>
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">تواصل معنا</a>
            </div>
          </div>
          <p className="text-sm mt-5 pt-5 border-t border-border/30 text-center" style={{ color: "#6B7280" }}>© 2026 PostLapAI. جميع الحقوق محفوظة</p>
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
               سادك هكي يا غالي! جربت النظام وشفت الفلاحة.. لو تبي تكمل وتفحص كميات أكبر، سجّل الدخول مجاناً.
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
                 أنشئ حساباً مجانياً لمتابعة الفحص وكشف التحليل الكامل
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

      {/* Subscribe modal — in-platform Professional subscription */}
      {subscribeModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          data-testid="modal-subscribe"
          onClick={() => setSubscribeModal(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div />
              <p className="text-lg font-black text-foreground">اشترك في Professional</p>
              <button
                onClick={() => setSubscribeModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-subscribe-modal-close"
                aria-label="إغلاق"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-3xl font-black text-primary">800 <span className="text-lg">د.ل</span></p>
              <p className="text-xs text-muted-foreground mt-1">شهرياً — تفعيل فوري</p>
            </div>
            <ul className="space-y-2 text-sm text-foreground text-right max-w-xs mx-auto">
              {["توليد نصوص إعلانية باللهجة الليبية", "تصميم منشورات بشعار نشاطك وهويته", "ذاكرة دائمة لنشاطك — حمزاوي يتذكره دائماً", "فحوصات غير محدودة"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground leading-relaxed">
              بعد الاشتراك سنجهّز ملف نشاطك التجاري في خطوة واحدة، ثم يبدأ حمزاوي بالعمل مباشرة.
            </p>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-black text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="button-subscribe-confirm"
            >
              {subscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {subscribing ? "جاري التفعيل..." : "فعّل الاشتراك والمتابعة"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              الدفع بالتحويل البنكي — سنتواصل معك لإتمامه، وتستطيع البدء فوراً.
            </p>
          </div>
        </div>
      )}

      {/* Login modal */}
      {showLoginModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          data-testid="modal-login"
          onClick={() => setShowLoginModal(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div />
              <p className="text-lg font-black text-foreground">سجّل الدخول</p>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-login-modal-close"
                aria-label="إغلاق"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              سجّل دخولك مجاناً للوصول إلى التحليل التفصيلي وميزات المنصة
            </p>
            <div className="flex justify-center" ref={googleBtnLoginModalRef} data-testid="button-google-signin-login-modal" />
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
    </div>
  );
}
