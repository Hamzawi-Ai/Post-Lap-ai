import { useState, useRef, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Loader2, Shield, Lock, Store, Sparkles, PenLine, Palette, BrainCircuit, Menu } from "lucide-react";
import { useGetConfig, getGetConfigQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/useLanguage";
import { ui } from "@/lib/i18n";
import { handleAuthError as authError, clearAuth as clearAuthState, setToken } from "@/lib/utils";
import { useLocation } from "wouter";
import HamzawiChat from "@/components/HamzawiChat";
import HamzawiSidebar, { type Conversation } from "@/components/HamzawiSidebar";

const TRIALS_KEY = "postlap_trials";
const MAX_VISITOR_TRIALS = 3;
const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";
const GENDER_KEY = "postlap_gender";
const COOKIE_KEY = "postlap_cookie_consent";

type CheckStatus = "ممتاز" | "جيد" | "مرفوض" | "غير معروف";

interface LocalUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  gender: string | null;
  is_active: boolean;
  beta_access?: boolean;
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
// free=1, pro=2
function planLevelFrontend(plan: string): number {
  const levels: Record<string, number> = {
    free: 1, pro: 2,
  };
  return levels[plan] ?? 1;
}

function isDiscountActive(): boolean {
  return false;
}

export default function Home() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: config } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });
  const { lang } = useLanguage();
  const t = ui[lang];

  const [user, setUser] = useState<LocalUser | null>(getStoredUser);
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [checkResult, setCheckResult] = useState<{ id?: number; status: CheckStatus; message: string; score: number; frames_checked?: number | null; violations?: Array<{ type: string; reason: string; severity: string }>; suggestions?: string[] } | null>(null);
  const [trialBlockModal, setTrialBlockModal] = useState(false);
  const [genderModal, setGenderModal] = useState(false);
  const [cookieConsent, setCookieConsent] = useState(() => !!localStorage.getItem(COOKIE_KEY));
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [subscribeModal, setSubscribeModal] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [userRefreshed, setUserRefreshed] = useState(false);
  const googleBtnModalRef = useRef<HTMLDivElement>(null);
  const googleBtnLoginModalRef = useRef<HTMLDivElement>(null);

  const gender = (user?.gender ?? localStorage.getItem(GENDER_KEY) ?? null) as "male" | "female" | null;
  const discountActive = isDiscountActive();

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
      setToken(data.token);
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
    // Drop the previous account's conversation workspace so no stale titles or
    // conversation id survive a logout (Issue 4 isolation).
    setConversations([]);
    setActiveConversationId(null);
    // Best-effort server-side session cleanup (clears the guest session cookie).
    try {
      fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    } catch {
      // no-op — logout succeeds regardless
    }
    toast({ title: "تم تسجيل الخروج" });
  }

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const isAuthenticated = !!user && !!getToken();

  // Issue 4 isolation: the conversation workspace is scoped to the authenticated
  // identity. Any identity change invalidates the previous account's conversation
  // list and active conversation id, so a different account can never reuse or
  // display the previous account's conversation state.
  const currentUserId = user?.id ?? null;

  useEffect(() => {
    setConversations([]);
    setActiveConversationId(null);
  }, [currentUserId]);

  // Cross-tab account switching (Issue 4): the browser `storage` event fires in
  // OTHER tabs when postlap_token/postlap_user changes in this browser. Re-read
  // the stored auth state and re-sync the React user so the currentUserId
  // effects above invalidate the stale workspace and refetch for the new
  // identity. The tab that made the change is handled by the existing same-tab
  // login/logout flow (setToken/logout) — the storage event does not fire there,
  // so no update loop is possible.
  useEffect(() => {
    function onAuthStorageChange(e: StorageEvent) {
      if (e.key !== TOKEN_KEY && e.key !== USER_KEY) return;
      setUser(getStoredUser());
    }
    window.addEventListener("storage", onAuthStorageChange);
    return () => window.removeEventListener("storage", onAuthStorageChange);
  }, []);

  const fetchConversations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/hamzawi/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      console.error("Failed to fetch conversations");
    }
  }, []);

  // Fetch the current identity's conversations whenever the identity changes,
  // not merely when isAuthenticated flips (Issue 4: account switch / cross-tab).
  useEffect(() => {
    if (user && getToken()) {
      fetchConversations();
    }
  }, [currentUserId, fetchConversations]);

  function handleSelect(id: string) {
    setActiveConversationId(id);
  }

  function handleNew() {
    setActiveConversationId(null);
  }

  async function handleRename(id: string, title: string) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/hamzawi/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        await fetchConversations();
      }
    } catch {
      console.error("Failed to rename conversation");
    }
  }

  async function handleDelete(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/hamzawi/conversations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (activeConversationId === id) {
          setActiveConversationId(null);
        }
        await fetchConversations();
      }
    } catch {
      console.error("Failed to delete conversation");
    }
  }

  function handleConversationCreated(id: string) {
    setActiveConversationId(id);
    fetchConversations();
  }

  // First-time onboarding gate: PRO users (level 2+) whose brand profile is not
  // complete are sent to /onboarding. Uses the server-computed brand_profile_complete
  // (flag + core-data check) so a lost flag never forces re-onboarding.
  // Runs only AFTER the mount refresh completes so a stale localStorage user (with the old
  // brand_profile_complete=false) never re-redirects back to /onboarding after setup is done.
  useEffect(() => {
    if (!user || !userRefreshed) return;
    if (planLevelFrontend(user.plan) >= 2 && user.brand_profile_complete === false) {
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
      toast({ title: `تم الاشتراك في ${contentPlan?.name ?? "إدارة المحتوى"} 🎉`, description: `فعّلنا خطة ${contentPlan?.name ?? "إدارة المحتوى"} (${contentPlan?.price ?? 400} ${currency}/شهر) — جهّز نشاطك التجاري الآن` });
      navigate("/onboarding");
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
    } else if (user.plan === "free" && user.trials_remaining <= 0 && !user.beta_access) {
      setTrialBlockModal(true); return;
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


  function acceptCookies() {
    localStorage.setItem(COOKIE_KEY, "1");
    setCookieConsent(true);
  }


  const faqs = [
    { q: "كيف يعمل PostLapAI؟", a: "عرّف PostLab على نشاطك مرة واحدة، ثم اطلب منه توليد منشوراتك ونصوصك الإعلانية بالليبي الأصيل وتصميم صورها بهوية نشاطك — وكل منشور يُفحص تلقائياً لضمان توافقه مع سياسات Meta قبل النشر." },
    { q: "هل نتائج الفحص دقيقة 100%؟", a: "الفحص يستند إلى سياسات Meta الإعلانية ويُحدَّث وفق تغيّراتها، لذا تبقى النتيجة مساعدة ولا تضمن قبول المنصة." },
    { q: "هل تخزنون محتواي؟", a: "لا، نحذف جميع الملفات فور انتهاء التحليل. لا نخزن محتواك أبداً." },
    { q: "ما الفرق بين الخطط؟", a: "خطة FREE مجانية وتتيح فحص الإعلانات وتحليلها وإصلاح الصور المرفوضة. خطة PRO تضيف توليد النصوص التسويقية وتصميم المنشورات بهوية نشاطك وهوية النشاط التجاري الكاملة (Brand Brain)." },
    { q: "كيف أشترك؟", a: "تواصل معنا عبر واتساب وأرسل اسم الخطة التي تريدها. نقبل الدفع بالتحويل المصرفي." },
    { q: "هل يدعم فيديوهات تيك توك؟", a: "نعم، نقبل ملفات MP4 في فحص الإعلانات ويُحلل الفيديو فريم بفريم وفق سياسات المنصات الإعلانية." },
  ];

  const whatsapp = config?.whatsapp ?? "218915811115";

  // Pricing — single source of truth is config.json (served by /api/config).
  const currency = config?.pricing?.currency ?? "د.ل";
  const fallbackPlans = [
    {
      id: "free",
      name: "مجاني (FREE)",
      nameAr: "للأفراد والتجربة",
      price: 0,
      desc: "للأفراد والتجربة",
      features: ["فحص الإعلانات وتحليل المحتوى", "عرض المخالفات والتوصيات", "إصلاح الصور المرفوضة بالذكاء الاصطناعي",           "فحص الإعلانات مجاناً"],
      badge: "",
      cta: "ابدأ مجاناً",
      highlight: false,
    },
    {
      id: "pro",
      name: "احترافي (PRO)",
      nameAr: "للشركات والمتاجر",
      price: 400,
      desc: "للشركات والمتاجر",
      features: ["كل مميزات المجاني", "توليد نصوص إعلانية بالليبي الأصيل", "توليد صور المنشورات بالذكاء الاصطناعي", "تصميم منشورات بشعار نشاطك وألوانه", "ذاكرة دائمة — PostLab يتذكر نشاطك"],
      badge: "الأكثر طلباً",
      cta: "اشترك في PRO",
      highlight: true,
    },
  ];
  const plans = config?.pricing?.plans?.length ? config.pricing.plans : fallbackPlans;
  const contentPlan = plans.find((p) => p.id === "pro") ?? plans.find((p) => p.highlight) ?? plans[0];

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
            <span className="hidden sm:inline text-xs text-muted-foreground border border-border rounded px-2 py-0.5">{lang === "ar" ? "مساعدك التسويقي" : "AI Marketing Assistant"}</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#plans" className="hover:text-foreground transition-colors">{lang === "ar" ? "الخطط" : "Plans"}</a>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={() => setSidebarVisible(true)}
                className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
                aria-label="فتح المحادثات"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${user.plan === "pro" ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                  {user.plan === "pro" ? "PRO" : "FREE"}
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

      {/* ChatGPT-style workspace */}
      <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden" dir="rtl">
        {isAuthenticated && (
          <HamzawiSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelect}
            onNew={handleNew}
            onRename={handleRename}
            onDelete={handleDelete}
            visible={sidebarVisible}
            onClose={() => setSidebarVisible(false)}
          />
        )}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <HamzawiChat
            embedded
            gender={gender}
            checkResult={checkResult}
            whatsapp={whatsapp}
            userPlan={user?.plan}
            betaAccess={user?.beta_access === true}
            onFileCheck={handleFile}
            checking={checking}
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
          />
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-16">

        {/* ── 4. Features ─────────────────────────────────────────────────── */}
        <section id="why" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-2">لماذا PostLapAI؟</h2>
          <p className="text-center text-muted-foreground text-sm mb-10">مساعدك التسويقي الواحد — من الفكرة إلى النشر</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <Sparkles className="w-5 h-5 text-primary" />, title: "مساعد تسويقي ذكي", desc: "PostLab يفهم نشاطك ويولّد محتوى يناسب هويتك وأسلوبك" },
              { icon: <PenLine className="w-5 h-5 text-primary" />, title: "نصوص ليبية أصيلة", desc: "توليد إعلاني باللهجات الغربية والشرقية والجنوبية" },
              { icon: <Palette className="w-5 h-5 text-primary" />, title: "تصميم بهوية نشاطك", desc: "شعارك وألوانك وأسلوبك المفضل في كل منشور" },
              { icon: <BrainCircuit className="w-5 h-5 text-primary" />, title: "ذاكرة دائمة لنشاطك", desc: "PostLab يتذكر اسم نشاطك ومجاله وتفضيلاتك في كل مرة" },
              { icon: <Shield className="w-5 h-5 text-primary" />, title: "متوافق مع Meta", desc: "كل منشور يُفحص لضمان التوافق قبل النشر — بدون مفاجآت" },
              { icon: <Lock className="w-5 h-5 text-primary" />, title: "خصوصية تامة", desc: "محتواك لا يُخزن أبداً — يُحذف فور الانتهاء من التحليل" },
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
              const isContentMgmt = !!plan.highlight;
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
                          <span className={`font-black ${isContentMgmt ? "text-4xl text-primary" : "text-3xl text-foreground"}`}>{discountedPrice} <span className="text-lg">{currency}</span></span>
                          <span className="text-base text-muted-foreground line-through">{plan.price}</span>
                        </>
                      ) : (
                        <span className={`font-black ${isContentMgmt ? "text-4xl text-primary" : "text-3xl text-foreground"}`}>{plan.price} <span className="text-lg">{currency}</span></span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">شهرياً — {plan.desc}</p>
                    {discountActive && (
                      <p className="text-xs text-yellow-400 font-semibold mt-1">🔥 خصم 50% — ادفع {discountedPrice} {currency} فقط</p>
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
          <p className="text-center text-muted-foreground text-xs mb-8">ثلاث خطوات من الفكرة إلى المنشور الجاهز</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {[
              { step: "01", emoji: "🏪", title: "عرّف PostLab على نشاطك", desc: "سجّل وأخبره باسم نشاطك ومجاله وأسلوبك المفضل مرة واحدة" },
              { step: "02", emoji: "✨", title: "اطلب منشورك", desc: "اكتب وصف منتجك وعرضك — نصاً أو تصميماً — بالطريقة التي تحبها" },
              { step: "03", emoji: "🚀", title: "انشر بثقة", desc: "نص ليبي أصيل وتصميم بهوية نشاطك، متوافق مع سياسات Meta" },
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
            { label: "لا نخزن محتواك", emoji: "🗑️" },
            { label: "متوافق مع Meta", emoji: "✅" },
            { label: "توليد فوري", emoji: "⚡" },
            { label: "تصميم بهوية نشاطك", emoji: "🎨" },
            { label: "اللهجة الليبية الأصيلة", emoji: "🗣️" },
          ].map((b) => (
            <div key={b.label} className="flex items-center gap-2 border border-border rounded-full px-4 py-1.5 bg-card text-xs text-muted-foreground hover:border-primary/30 transition-colors">
              <span>{b.emoji}</span>
              {b.label}
            </div>
          ))}
        </section>

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
              <p className="text-sm text-muted-foreground mt-1">{lang === "ar" ? "مساعدك التسويقي بالذكاء الاصطناعي — ولّد منشوراتك، صمّم صورها، وتأكد من توافقها مع سياسات Meta" : "Your AI marketing assistant — generate posts, design visuals, and stay Meta-compliant"}</p>
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
               سادك هكي يا غالي! جربت PostLab وشفت الفلاحة.. لو تبي تكمل وتولّد منشوراتك وتصميماتك، سجّل الدخول مجاناً.
             </p>
             <div className="space-y-3">
               <div ref={googleBtnModalRef} className="flex justify-center" />
               <a
                 href={`https://wa.me/${whatsapp}?text=أريد الاشتراك في خطة PRO - PostLapAI`}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="block w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                 data-testid="button-modal-subscribe"
               >
                  أنشئ حساباً مجانياً وابدأ توليد منشوراتك مع PostLab
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
                <p className="text-lg font-black text-foreground">اشترك في {contentPlan?.name ?? "إدارة المحتوى"}</p>
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
                <p className="text-3xl font-black text-primary">{contentPlan?.price ?? 400} <span className="text-lg">{currency}</span></p>
                <p className="text-xs text-muted-foreground mt-1">شهرياً — تفعيل فوري</p>
              </div>
            <ul className="space-y-2 text-sm text-foreground text-right max-w-xs mx-auto">
              {["توليد نصوص إعلانية باللهجة الليبية", "تصميم منشورات بشعار نشاطك وهويته", "ذاكرة دائمة لنشاطك — PostLab يتذكره دائماً", "فحوصات غير محدودة"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground leading-relaxed">
              بعد الاشتراك سنجهّز ملف نشاطك التجاري في خطوة واحدة، ثم يبدأ PostLab بالعمل مباشرة.
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
              سجّل دخولك مجاناً وابدأ توليد منشوراتك ونصوصك الإعلانية مع PostLab
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
