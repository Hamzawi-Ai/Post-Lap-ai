import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, CheckCircle, XCircle, AlertCircle, Loader2, Copy, Check, Shield, Eye, Lock } from "lucide-react";
import { useGetConfig, useCheckAd, useGenerateAdText, useGetStats, getGetConfigQueryKey, getGetStatsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const TRIALS_KEY = "postlap_trials";
const MAX_VISITOR_TRIALS = 3;
const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";
const COOKIE_KEY = "postlap_cookie_consent";

type CheckStatus = "ممتاز" | "جيد" | "مرفوض";

interface LocalUser {
  id: number;
  email: string;
  name: string;
  plan: string;
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

export default function Home() {
  const { toast } = useToast();
  const { data: config } = useGetConfig({ query: { queryKey: getGetConfigQueryKey() } });
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });
  const checkAd = useCheckAd();
  const generateText = useGenerateAdText();

  const [user, setUser] = useState<LocalUser | null>(getStoredUser);
  const [dragging, setDragging] = useState(false);
  const [checkResult, setCheckResult] = useState<{ status: CheckStatus; message: string; score: number; frames_checked?: number | null } | null>(null);
  const [trialBlockModal, setTrialBlockModal] = useState(false);
  const [product, setProduct] = useState("");
  const [dialect, setDialect] = useState<"شرقية" | "غربية" | "جنوبية">("غربية");
  const [generatedText, setGeneratedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [cookieConsent, setCookieConsent] = useState(() => !!localStorage.getItem(COOKIE_KEY));
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const authGoogle = (useGenerateAdText as any); // placeholder, we'll call fetch directly

  // Init Google Sign-In button
  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId || !googleBtnRef.current) return;
    const w = window as any;
    if (!w.google?.accounts?.id) return;
    w.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
    });
    w.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      locale: "ar",
    });
  }, [googleBtnRef.current]);

  async function handleGoogleCredential(response: any) {
    setAuthLoading(true);
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
    } catch {
      toast({ title: "خطأ", description: "فشل تسجيل الدخول", variant: "destructive" });
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    toast({ title: "تم تسجيل الخروج" });
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

    // Check trial limits
    if (!user) {
      const trials = getTrials();
      if (trials <= 0) { setTrialBlockModal(true); return; }
    } else if (user.plan !== "professional" && user.trials_remaining <= 0) {
      setTrialBlockModal(true); return;
    }

    setCheckResult(null);
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
      if (!res.ok) { toast({ title: "خطأ", description: data.error, variant: "destructive" }); return; }
      setCheckResult(data);
      if (!user) decrementTrials();
    } catch {
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
    }
  }

  function copyText() {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function acceptCookies() {
    localStorage.setItem(COOKIE_KEY, "1");
    setCookieConsent(true);
  }

  const statusColor: Record<CheckStatus, string> = {
    "ممتاز": "text-green-400 border-green-400/30 bg-green-400/10",
    "جيد": "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
    "مرفوض": "text-red-400 border-red-400/30 bg-red-400/10",
  };
  const statusIcon: Record<CheckStatus, React.ReactNode> = {
    "ممتاز": <CheckCircle className="w-8 h-8 text-green-400" />,
    "جيد": <AlertCircle className="w-8 h-8 text-yellow-400" />,
    "مرفوض": <XCircle className="w-8 h-8 text-red-400" />,
  };

  const faqs = [
    { q: "كيف يعمل PostLapAI؟", a: "ارفع صورة أو فيديو إعلانك، يحللها الذكاء الاصطناعي مقارنةً بسياسات Meta وTikTok ويعطيك نتيجة فورية." },
    { q: "هل نتائج الفحص دقيقة 100%؟", a: "الدقة 90% لأن سياسات المنصات تتحدث باستمرار. النتيجة مساعدة لكنها لا تضمن قبول المنصة." },
    { q: "هل تخزنون إعلاناتنا؟", a: "لا، نحذف جميع الملفات فور انتهاء التحليل. لا نخزن محتواك أبداً." },
    { q: "ما الفرق بين الخطط؟", a: "الزائر: 3 فحوصات مجانية. المسجل: 6 فحوصات يومياً. الاحترافي: فحوصات غير محدودة مع دعم الفيديو 60 ثانية." },
    { q: "كيف أشترك في الخطة الاحترافية؟", a: "تواصل معنا عبر واتساب وأرسل 'اشتراك احترافي PostLapAI'. نقبل الدفع بالتحويل المصرفي." },
    { q: "هل يدعم فيديوهات تيك توك؟", a: "نعم، نقبل ملفات MP4. يُرفع الفيديو ويُحلل فريم بفريم وفق سياسات Meta وTikTok." },
  ];

  const agents = config?.agents ?? { libya: "", jordan: "قريباً", saudi: "قريباً" };
  const accuracyText = config?.accuracy_text ?? "النتيجة 90% صحيحة بسبب تحديث سياسات Meta & TikTok باستمرار";
  const whatsapp = config?.whatsapp ?? "218915811115";
  const proPrice = config?.pro_price ?? "200 د.ل";

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
              <span className="text-xs text-muted-foreground">{getTrials()} محاولات متبقية</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-16">

        {/* Upload Section — FULL WIDTH, FIRST */}
        <section id="upload" className="w-full">
          <div
            className={`relative w-full border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
              dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-card"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
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
                <p className="text-xl font-bold text-foreground">اسحب وأفلت الصورة أو الريلز هنا للفحص</p>
                <p className="text-muted-foreground mt-1 text-sm">أو انقر للاختيار — PNG، JPG، MP4 — حتى 50 ميجابايت</p>
              </div>
              <p className="text-xs text-muted-foreground/70 max-w-md">{accuracyText}</p>
            </div>
          </div>

          {/* Check loading */}
          {checkAd.isPending && (
            <div className="mt-6 flex flex-col items-center gap-3 text-muted-foreground" data-testid="status-loading">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">جاري تحليل الإعلان...</p>
            </div>
          )}

          {/* Check result */}
          {checkResult && !checkAd.isPending && (
            <div className={`mt-6 rounded-2xl border p-6 flex flex-col sm:flex-row items-start gap-4 ${statusColor[checkResult.status]}`} data-testid="status-result">
              {statusIcon[checkResult.status]}
              <div className="flex-1">
                <p className="text-xl font-bold">{checkResult.message}</p>
                {checkResult.frames_checked != null && (
                  <p className="text-sm opacity-70 mt-1">فُحص {checkResult.frames_checked} فريم</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm opacity-70">النقاط:</span>
                  <div className="flex-1 h-2 rounded-full bg-black/20 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${checkResult.status === "ممتاز" ? "bg-green-400" : checkResult.status === "جيد" ? "bg-yellow-400" : "bg-red-400"}`}
                      style={{ width: `${checkResult.score}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold">{checkResult.score}/100</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Subscription Plans */}
        <section id="plans" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">اختر خطتك</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Visitor */}
            <div className="border border-border rounded-2xl p-6 bg-card flex flex-col gap-4" data-testid="card-plan-visitor">
              <div>
                <h3 className="text-lg font-bold text-foreground">زائر</h3>
                <p className="text-3xl font-black text-foreground mt-1">مجاني</p>
                <p className="text-muted-foreground text-sm mt-1">3 فحوصات مجانية</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> فحص الصور</li>
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> فيديو حتى 11 ثانية</li>
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> توليد النصوص</li>
              </ul>
              <div className="text-xs text-muted-foreground border border-border rounded-lg p-2 text-center">
                متبقي: {user ? (user.plan !== "professional" ? user.trials_remaining : "غير محدود") : getTrials()} محاولة
              </div>
            </div>

            {/* Registered */}
            <div className="border border-primary/30 rounded-2xl p-6 bg-primary/5 flex flex-col gap-4" data-testid="card-plan-registered">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">مسجل بجوجل</h3>
                  <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">الأفضل</span>
                </div>
                <p className="text-3xl font-black text-primary mt-1">مجاني</p>
                <p className="text-muted-foreground text-sm mt-1">6 فحوصات يومياً</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> كل مميزات الزائر</li>
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> 6 فحوصات/يوم</li>
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> حفظ السجل</li>
              </ul>
              {user ? (
                <div className="text-center text-sm text-primary font-semibold">مسجل الدخول</div>
              ) : (
                <div ref={googleBtnRef} className="flex justify-center" data-testid="button-google-signin" />
              )}
            </div>

            {/* Professional */}
            <div className="border border-border rounded-2xl p-6 bg-card flex flex-col gap-4" data-testid="card-plan-professional">
              <div>
                <h3 className="text-lg font-bold text-foreground">احترافي</h3>
                <p className="text-3xl font-black text-foreground mt-1">{proPrice}</p>
                <p className="text-muted-foreground text-sm mt-1">شهرياً — غير محدود</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> فحوصات غير محدودة</li>
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> فيديو حتى 60 ثانية</li>
                <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" /> دعم أولوية</li>
              </ul>
              <a
                href={`https://wa.me/${whatsapp}?text=اشتراك احترافي PostLapAI`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-primary text-primary-foreground text-center py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity block"
                data-testid="button-subscribe-pro"
              >
                الاشتراك الاحترافي — {proPrice}
              </a>
              <p className="text-xs text-center text-muted-foreground">نقبل الدفع بالتحويل المصرفي</p>
            </div>
          </div>
        </section>

        {/* Ad Text Generator */}
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
                disabled={generateText.isPending}
                className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                data-testid="button-generate-text"
              >
                {generateText.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                ولّد النص
              </button>
            </div>
            {generatedText && (
              <div className="relative bg-card border border-border rounded-xl p-4" data-testid="text-generated-result">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{generatedText}</p>
                <button
                  onClick={copyText}
                  className="absolute top-3 left-3 p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                  data-testid="button-copy-text"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                </button>
                <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
                  النصوص متوافقة مع سياسات Meta ومولدة بالذكاء الاصطناعي
                </p>
              </div>
            )}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">كيف يعمل؟</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "ارفع الإعلان", desc: "اسحب وأفلت صورة PNG/JPG أو فيديو MP4 في مربع الرفع" },
              { step: "02", title: "تحليل فوري", desc: "الذكاء الاصطناعي يفحص كل فريم مقارنةً بسياسات Meta وTikTok" },
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

        {/* Why PostLapAI */}
        <section id="why" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">لماذا PostLapAI؟</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: <Shield className="w-6 h-6 text-primary" />, title: "دقة عالية", desc: "نموذج GPT-4o مع موجه متخصص في سياسات الإعلانات" },
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

        {/* Trust badges */}
        <section className="flex flex-wrap justify-center gap-4">
          {["آمن 100%", "لا نخزن إعلاناتك", "متوافق مع Meta & TikTok"].map((b) => (
            <div key={b} className="flex items-center gap-2 border border-border rounded-full px-4 py-2 bg-card text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-primary" />
              {b}
            </div>
          ))}
        </section>

        {/* Stats */}
        {stats && (
          <section className="grid grid-cols-3 gap-4">
            {[
              { label: "إجمالي الفحوصات", value: stats.total_checks },
              { label: "المستخدمون", value: stats.total_users },
              { label: "فحوصات اليوم", value: stats.checks_today },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-5 text-center">
                <p className="text-3xl font-black text-primary">{s.value.toLocaleString("ar")}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </section>
        )}

        {/* Agents */}
        <section id="agents" className="w-full">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">الوكلاء المعتمدون</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { country: "ليبيا", flag: "LY", addr: agents.libya, wa: whatsapp, live: true },
              { country: "الأردن", flag: "JO", addr: agents.jordan, wa: null, live: false },
              { country: "السعودية", flag: "SA", addr: agents.saudi, wa: null, live: false },
            ].map((a) => (
              <div key={a.country} className={`border rounded-2xl p-6 bg-card flex flex-col gap-3 ${a.live ? "border-primary/30" : "border-border opacity-70"}`} data-testid={`card-agent-${a.country}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{a.flag === "LY" ? "🇱🇾" : a.flag === "JO" ? "🇯🇴" : "🇸🇦"}</span>
                  <h3 className="font-bold text-foreground">{a.country}</h3>
                  {a.live && <span className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5">نشط</span>}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{a.addr}</p>
                {a.wa ? (
                  <a
                    href={`https://wa.me/${a.wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                    data-testid={`link-agent-wa-${a.country}`}
                  >
                    واتساب: {a.wa}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">تواصل معنا للشراكة</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="w-full max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-center text-foreground mb-8">الأسئلة الشائعة</h2>
          <div className="space-y-2">
            {faqs.map((f, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden bg-card" data-testid={`faq-item-${i}`}>
                <button
                  className="w-full text-right px-5 py-4 flex justify-between items-center text-foreground font-semibold hover:bg-muted/50 transition-colors"
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  data-testid={`button-faq-${i}`}
                >
                  {f.q}
                  <span className="text-muted-foreground text-lg">{faqOpen === i ? "−" : "+"}</span>
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
              <a href="#" className="hover:text-foreground transition-colors">سياسة الخصوصية</a>
              <a href="#" className="hover:text-foreground transition-colors">الشروط والأحكام</a>
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">تواصل معنا</a>
              <a href="#" className="hover:text-foreground transition-colors">API للمطورين</a>
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
              <div ref={googleBtnRef} className="flex justify-center" />
              <a
                href={`https://wa.me/${whatsapp}?text=اشتراك احترافي PostLapAI`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                data-testid="button-modal-subscribe"
              >
                الاشتراك الاحترافي — {proPrice}
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
