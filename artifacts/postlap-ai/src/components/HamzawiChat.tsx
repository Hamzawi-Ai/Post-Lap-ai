import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, BookmarkPlus, Sparkles, Paperclip, Download, RefreshCw, Image as ImageIcon } from "lucide-react";

const LANG_KEY = "postlap_lang";
const SESSION_OPENED_KEY = "hamzawi_opened";
const TOKEN_KEY = "postlap_token";

function detectLanguage(): "ar" | "en" {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === "ar" || stored === "en") return stored;
  const lang = navigator.language || (navigator as any).userLanguage || "";
  const isArabic = /^ar/i.test(lang);
  const detected: "ar" | "en" = isArabic ? "ar" : "en";
  localStorage.setItem(LANG_KEY, detected);
  return detected;
}

const i18n = {
  ar: {
    title: "حمزاوي",
    subtitle: "مساعدك الإعلاني الذكي",
    placeholder: "اكتب رسالتك...",
    loading: "جاري التحميل...",
    thinking: "حمزاوي يفكر...",
    saveBrand: "احفظ هوية نشاطي",
    saveTitle: "هوية النشاط التجاري",
    businessName: "اسم النشاط",
    businessType: "نوع النشاط",
    address: "العنوان / المنطقة",
    phone: "رقم الهاتف",
    primaryColors: "الألوان الأساسية",
    style: "الأسلوب المفضل",
    notes: "ملاحظات",
    logoLabel: "شعار النشاط",
    uploadLogo: "رفع الشعار",
    save: "حفظ",
    cancel: "إلغاء",
    upgradeMsg: "حفظ هوية النشاط متاح للمستخدمين المسجّلين فأعلى",
    welcome: "السلام عليكم! 👋 أنا حمزاوي، مساعدك الإعلاني الذكي. أقدر أساعدك في فحص إعلاناتك، اقتراح تحسينات، وتوليد محتوى تسويقي. كيف أخدمك؟",
    newPost: "✦ منشور جديد",
    newPostTitle: "إنشاء منشور جديد",
    productDescPlaceholder: "مثال: عرض خاص على برغر الدجاج — 50% خصم اليوم فقط",
    uploadImage: "رفع صورة المنتج (اختياري)",
    generatePost: "توليد المنشور",
    generatingPost: "جاري توليد المنشور...",
    regenerate: "أعد التوليد",
    download: "حمّل الصورة",
    attachFile: "إرفاق صورة",
    postGenerated: "✅ تم توليد المنشور! يمكنك تنزيله أو إعادة توليده.",
    postError: "حدث خطأ أثناء توليد المنشور.",
    uploading: "جاري رفع الملف...",
    uploadedLogo: "تم رفع الشعار ✓",
    attachTip: "انقر لإرفاق صورة (شعار، تصميم سابق، أو صورة منتج)",
    regeneratePrompt: "ملاحظة للتوليد (اختياري):",
  },
  en: {
    title: "Hamzawi",
    subtitle: "Your smart ad assistant",
    placeholder: "Type your message...",
    loading: "Loading...",
    thinking: "Hamzawi is thinking...",
    saveBrand: "Save my brand identity",
    saveTitle: "Brand Identity",
    businessName: "Business name",
    businessType: "Business type",
    address: "Address / Area",
    phone: "Phone number",
    primaryColors: "Primary colors",
    style: "Preferred style",
    notes: "Notes",
    logoLabel: "Business logo",
    uploadLogo: "Upload logo",
    save: "Save",
    cancel: "Cancel",
    upgradeMsg: "Brand identity is available for registered users and above",
    welcome: "Hello! 👋 I'm Hamzawi, your smart advertising assistant. I can help you check your ads, suggest improvements, and generate marketing content. How can I help you?",
    newPost: "✦ New Post",
    newPostTitle: "Create New Post",
    productDescPlaceholder: "e.g., Special offer on chicken burger — 50% off today only",
    uploadImage: "Upload product image (optional)",
    generatePost: "Generate Post",
    generatingPost: "Generating your post...",
    regenerate: "Regenerate",
    download: "Download Image",
    attachFile: "Attach image",
    postGenerated: "✅ Post generated! You can download or regenerate it.",
    postError: "Error generating post.",
    uploading: "Uploading...",
    uploadedLogo: "Logo uploaded ✓",
    attachTip: "Click to attach an image (logo, design sample, or product photo)",
    regeneratePrompt: "Regeneration note (optional):",
  },
};

interface HamzawiChatProps {
  gender: "male" | "female" | null;
  checkResult: {
    status: string;
    score: number;
    violations?: Array<{ type: string; reason: string; severity: string }>;
    suggestions?: string[];
  } | null;
  whatsapp: string;
  userPlan?: string;
}

interface Message {
  from: "hamzawi" | "user";
  text: string;
  time: string;
  imageUrl?: string;
  isGeneratedPost?: boolean;
}

// Payload kept for regeneration — never cleared when form resets
interface GenerationPayload {
  description: string;
  imageBase64: string | null;
}

function now() {
  return new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function planLevel(plan?: string): number {
  const levels: Record<string, number> = {
    visitor: 1,
    registered: 2,
    professional: 3,
    smart_fix: 3,
    content: 4,
    agency: 5,
  };
  return levels[plan ?? "visitor"] ?? 1;
}

export default function HamzawiChat({ gender, checkResult, whatsapp, userPlan }: HamzawiChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [initialized, setInitialized] = useState(false);
  const lastReportedCheckRef = useRef<typeof checkResult>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [brandForm, setBrandForm] = useState({
    business_name: "",
    business_type: "",
    address: "",
    phone: "",
    primary_colors: "",
    preferred_style: "",
    notes: "",
    logo_url: "",
  });
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [unread, setUnread] = useState(false);

  // New Post panel state
  const [showNewPost, setShowNewPost] = useState(false);
  const [postDescription, setPostDescription] = useState("");
  const [postImageBase64, setPostImageBase64] = useState<string | null>(null);
  const [postImageName, setPostImageName] = useState("");
  const [generatingPost, setGeneratingPost] = useState(false);

  // Last generation payload — preserved for regeneration even after form changes
  const lastGenPayloadRef = useRef<GenerationPayload | null>(null);

  // Upload state
  const [uploadingAsset, setUploadingAsset] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const postImageInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const t = i18n[lang];
  const level = planLevel(userPlan);

  useEffect(() => {
    setLang(detectLanguage());
  }, []);

  function addHamzawi(text: string, extra?: Partial<Message>) {
    setMessages((prev) => [...prev, { from: "hamzawi", text, time: now(), ...extra }]);
    if (!open) setUnread(true);
  }

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoaded(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch("/api/hamzawi/messages", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = (data.messages ?? []).map((m: any) => ({
          from: m.role === "assistant" ? "hamzawi" : "user",
          text: m.content,
          time: new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }),
        }));
        if (msgs.length > 0) setMessages(msgs);
      }
    } catch {}
  }, [historyLoaded]);

  useEffect(() => {
    const hasOpened = sessionStorage.getItem(SESSION_OPENED_KEY);
    if (hasOpened) return;
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(SESSION_OPENED_KEY, "1");
      setUnread(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    setUnread(false);
    loadHistory().then(async () => {
      if (!initialized) {
        setInitialized(true);

        // For level 4+ authenticated users with no history, auto-start onboarding
        const token = localStorage.getItem(TOKEN_KEY);
        if (level >= 4 && token) {
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            // Temporary loading state — will be replaced by AI response
            return [{ from: "hamzawi" as const, text: "...", time: now() }];
          });
          try {
            const initRes = await fetch("/api/hamzawi/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ isInit: true }),
            });
            if (initRes.ok) {
              const data = await initRes.json() as { reply?: string | null };
              if (data.reply) {
                // Always show the AI onboarding message, even if history already exists.
                // Remove "..." placeholder, then append (or replace if history was empty).
                setMessages((prev) => {
                  const withoutPlaceholder = prev.filter((m) => m.text !== "...");
                  return [...withoutPlaceholder, { from: "hamzawi" as const, text: data.reply!, time: now() }];
                });
                return;
              }
            }
          } catch {}
          // Fallback: remove placeholder and show static welcome
          setMessages((prev) => {
            const withoutPlaceholder = prev.filter((m) => m.text !== "...");
            if (withoutPlaceholder.length === 0) {
              return [{ from: "hamzawi" as const, text: t.welcome, time: now() }];
            }
            return withoutPlaceholder;
          });
          return;
        }

        setMessages((prev) => {
          if (prev.length === 0) {
            return [{ from: "hamzawi" as const, text: t.welcome, time: now() }];
          }
          return prev;
        });
      }
    });
  }, [open]);

  useEffect(() => {
    if (!checkResult || !open) return;
    if (lastReportedCheckRef.current === checkResult) return;
    lastReportedCheckRef.current = checkResult;
    const report = {
      status: checkResult.status,
      score: checkResult.score,
      violations: checkResult.violations,
      suggestions: checkResult.suggestions,
    };
    const autoMsg = lang === "ar"
      ? `تحقق من نتيجة فحص الإعلان وأخبرني بتوصياتك`
      : `Check the ad review result and tell me your recommendations`;
    sendMessage(autoMsg, report);
  }, [checkResult, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, showNewPost, generatingPost]);

  async function sendMessage(
    text?: string,
    checkReport?: HamzawiChatProps["checkResult"] | null
  ) {
    const msgText = text ?? input.trim();
    if (!msgText) return;
    if (!text) setInput("");

    setMessages((prev) => [...prev, { from: "user", text: msgText, time: now() }]);
    setLoading(true);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch("/api/hamzawi/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msgText, checkReport: checkReport ?? null }),
      });

      if (res.ok) {
        const data = await res.json();
        addHamzawi(data.reply);
      } else {
        addHamzawi(lang === "ar" ? "عذراً، حدث خطأ. حاول مرة أخرى." : "Sorry, an error occurred. Please try again.");
      }
    } catch {
      addHamzawi(lang === "ar" ? "تعذر الاتصال. تحقق من الإنترنت." : "Connection failed. Check your internet.");
    } finally {
      setLoading(false);
    }
  }

  async function saveBrandMemory() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      await fetch("/api/hamzawi/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(brandForm),
      });
      setShowBrandForm(false);
      addHamzawi(lang === "ar"
        ? `تم حفظ هوية نشاطك التجاري "${brandForm.business_name || "النشاط"}" ✅ سأتذكرها في كل محادثة!`
        : `Brand identity saved for "${brandForm.business_name || "your business"}" ✅ I'll remember it in every conversation!`
      );
    } catch {
      addHamzawi(lang === "ar" ? "حدث خطأ أثناء الحفظ." : "Error saving brand identity.");
    }
  }

  /**
   * Upload a file to the backend upload-asset endpoint.
   * Returns the data URL or null on failure.
   */
  async function uploadAsset(file: File): Promise<string | null> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    setUploadingAsset(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/hamzawi/upload-asset", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        return (data as { url: string }).url ?? null;
      }
      return null;
    } catch {
      return null;
    } finally {
      setUploadingAsset(false);
    }
  }

  /**
   * Handle logo upload in the brand form.
   * Uploads to backend, stores URL in brandForm.logo_url.
   */
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const url = await uploadAsset(file);
    if (url) {
      setBrandForm((f) => ({ ...f, logo_url: url }));
    } else {
      addHamzawi(lang === "ar" ? "حدث خطأ أثناء رفع الشعار." : "Error uploading logo.");
    }
  }

  /**
   * Handle product image for new post panel — no backend upload needed;
   * we read it locally as base64 and pass directly to generate-post.
   */
  async function handlePostImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      setPostImageBase64(reader.result as string);
      setPostImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Paperclip attachment in main chat.
   * Uploads to backend and saves the returned URL as a Hamzawi message (for context/logo).
   * If the brand form is open, saves as logo_url.
   */
  async function handleChatAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const url = await uploadAsset(file);
    if (!url) {
      addHamzawi(lang === "ar" ? "حدث خطأ أثناء رفع الصورة." : "Error uploading image.");
      return;
    }

    if (showBrandForm) {
      // Save directly as logo in brand form (manual brand memory editing)
      setBrandForm((f) => ({ ...f, logo_url: url }));
      addHamzawi(lang === "ar" ? t.uploadedLogo : t.uploadedLogo);
    } else if (level >= 4) {
      // During onboarding (step 7) or post-onboarding for level 4+:
      // First upload → logo (if no logo yet); subsequent uploads → design samples
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          // Check if user already has a logo saved
          const memRes = await fetch("/api/hamzawi/memory", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const memData = memRes.ok ? (await memRes.json() as { memory?: { logo_url?: string | null; design_samples?: string | null } | null }) : {};
          const hasLogo = !!memData.memory?.logo_url;

          if (!hasLogo) {
            // First upload: save as logo
            await fetch("/api/hamzawi/memory", {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ logo_url: url }),
            });
            addHamzawi(
              lang === "ar"
                ? "تم حفظ الشعار في هوية نشاطك ✅ الآن يمكنك رفع تصاميم سابقة إضافية بنفس الطريقة، أو اكتب 'تخطّ' للمتابعة."
                : "Logo saved to your brand identity ✅ You can now upload previous design samples the same way, or type 'skip' to continue."
            );
          } else {
            // Subsequent uploads: append as design sample
            await fetch("/api/hamzawi/memory", {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ append_design_sample: url }),
            });
            addHamzawi(
              lang === "ar"
                ? "تم حفظ نموذج التصميم ✅ سأستخدمه كمرجع بصري عند إنشاء منشوراتك. يمكنك رفع المزيد أو اكتب 'تخطّ' للمتابعة."
                : "Design sample saved ✅ I'll use it as visual reference when generating posts. Upload more or type 'skip' to continue."
            );
          }
        } catch {
          addHamzawi(lang === "ar" ? "حدث خطأ أثناء حفظ الصورة." : "Error saving image.");
        }
      }
    } else {
      // Other users: confirm upload only
      addHamzawi(
        lang === "ar"
          ? "تم رفع الصورة ✓ يمكنك حفظها كشعار من إعدادات هوية نشاطك."
          : "Image uploaded ✓ You can save it as your logo from brand identity settings."
      );
    }
  }

  /**
   * Generate (or regenerate) a branded post.
   * isRegenerate=true reuses lastGenPayloadRef so the form can be cleared/changed safely.
   */
  async function handleGeneratePost(isRegenerate = false, regenerateNote?: string) {
    let description: string;
    let imageBase64: string | null;

    if (isRegenerate && lastGenPayloadRef.current) {
      // Use the stored payload from last successful generation
      description = lastGenPayloadRef.current.description;
      imageBase64 = lastGenPayloadRef.current.imageBase64;
    } else {
      description = postDescription.trim();
      imageBase64 = postImageBase64;
    }

    if (!description) return;

    // Save this payload for future regenerations before anything async happens
    lastGenPayloadRef.current = { description, imageBase64 };

    setGeneratingPost(true);

    if (!isRegenerate) {
      // Add the user request message immediately when user first clicks Generate
      setMessages((prev) => [
        ...prev,
        {
          from: "user",
          text: `${lang === "ar" ? "توليد منشور: " : "Generate post: "}${description}`,
          time: now(),
        },
      ]);
    }

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const body: Record<string, string> = { productDescription: description };
      if (imageBase64) body.productImageBase64 = imageBase64;
      if (regenerateNote) body.regenerateNote = regenerateNote;

      const res = await fetch("/api/image-gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: "new_post", ...body }),
      });

      if (res.ok) {
        const data = await res.json() as { url: string };

        // Close the new post panel after the first successful generation
        if (!isRegenerate) {
          setShowNewPost(false);
          // Keep postDescription and postImageBase64 — don't clear them so regenerate works
        }

        addHamzawi(t.postGenerated, {
          imageUrl: data.url,
          isGeneratedPost: true,
        });
      } else {
        const errBody = await res.json().catch(() => ({}));
        addHamzawi((errBody as any).error ?? t.postError);
        if (!isRegenerate) setShowNewPost(false);
      }
    } catch {
      addHamzawi(t.postError);
    } finally {
      setGeneratingPost(false);
    }
  }

  function downloadImage(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `hamzawi-post-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleRegenerateClick() {
    const note = prompt(t.regeneratePrompt) ?? "";
    handleGeneratePost(true, note);
  }

  const isRTL = lang === "ar";
  const dirAttr = isRTL ? "rtl" : "ltr";

  return (
    <div className={`fixed bottom-20 ${isRTL ? "left-4" : "right-4"} z-40 flex flex-col items-end gap-2`} dir={dirAttr}>
      {open && (
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-80 sm:w-96 flex flex-col overflow-hidden" style={{ height: "520px" }}>
          {/* Header */}
          <div className="bg-primary px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg font-black text-white">
                ح
              </div>
              <div>
                <p className="text-sm font-bold text-white">{t.title}</p>
                <p className="text-xs text-white/70">{t.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {level >= 4 && (
                <button
                  onClick={() => { setShowNewPost(!showNewPost); setShowBrandForm(false); }}
                  title={t.newPost}
                  className={`text-white/70 hover:text-white transition-colors text-xs font-semibold px-2 py-1 rounded-lg border border-white/20 hover:border-white/50 flex items-center gap-1 ${showNewPost ? "bg-white/20 text-white border-white/40" : ""}`}
                >
                  <Sparkles className="w-3 h-3" />
                  {t.newPost}
                </button>
              )}
              {level >= 2 && (
                <button
                  onClick={() => { setShowBrandForm(!showBrandForm); setShowNewPost(false); }}
                  title={t.saveBrand}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <BookmarkPlus className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* New Post Panel (level 4+) */}
          {showNewPost && (
            <div className="bg-muted/80 border-b border-border px-4 py-3 shrink-0 space-y-2 max-h-56 overflow-y-auto">
              <p className="text-xs font-bold text-foreground flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {t.newPostTitle}
              </p>
              <textarea
                className={`w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none ${isRTL ? "text-right" : "text-left"}`}
                placeholder={t.productDescPlaceholder}
                rows={2}
                value={postDescription}
                onChange={(e) => setPostDescription(e.target.value)}
              />
              <div>
                <input ref={postImageInputRef} type="file" accept="image/*" className="hidden" onChange={handlePostImageSelect} />
                <button
                  onClick={() => postImageInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-2 py-1.5 w-full hover:border-primary/50 transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{postImageName || t.uploadImage}</span>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleGeneratePost(false)}
                  disabled={generatingPost || !postDescription.trim()}
                  className="flex-1 bg-primary text-primary-foreground text-xs font-bold py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {generatingPost
                    ? <><Loader2 className="w-3 h-3 animate-spin" />{t.generatingPost}</>
                    : t.generatePost
                  }
                </button>
                <button
                  onClick={() => { setShowNewPost(false); }}
                  className="flex-1 bg-muted border border-border text-foreground text-xs py-1.5 rounded-lg hover:bg-muted/80 transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}

          {/* Brand memory form */}
          {showBrandForm && (
            <div className="bg-muted/80 border-b border-border px-4 py-3 shrink-0 space-y-2 max-h-72 overflow-y-auto">
              <p className="text-xs font-bold text-foreground">{t.saveTitle}</p>
              {level < 2 ? (
                <p className="text-xs text-muted-foreground">{t.upgradeMsg}</p>
              ) : (
                <>
                  <input
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t.businessName}
                    value={brandForm.business_name}
                    onChange={(e) => setBrandForm((f) => ({ ...f, business_name: e.target.value }))}
                  />
                  <input
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t.businessType}
                    value={brandForm.business_type}
                    onChange={(e) => setBrandForm((f) => ({ ...f, business_type: e.target.value }))}
                  />
                  <input
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t.address}
                    value={brandForm.address}
                    onChange={(e) => setBrandForm((f) => ({ ...f, address: e.target.value }))}
                  />
                  <input
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t.phone}
                    value={brandForm.phone}
                    onChange={(e) => setBrandForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                  <input
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t.primaryColors}
                    value={brandForm.primary_colors}
                    onChange={(e) => setBrandForm((f) => ({ ...f, primary_colors: e.target.value }))}
                  />
                  <input
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t.style}
                    value={brandForm.preferred_style}
                    onChange={(e) => setBrandForm((f) => ({ ...f, preferred_style: e.target.value }))}
                  />
                  <textarea
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                    placeholder={t.notes}
                    rows={2}
                    value={brandForm.notes}
                    onChange={(e) => setBrandForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                  {/* Logo upload section */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">{t.logoLabel}</p>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    {brandForm.logo_url ? (
                      <div className="flex items-center gap-2">
                        <img src={brandForm.logo_url} alt="logo" className="w-10 h-10 rounded object-cover border border-border" />
                        <button
                          onClick={() => logoInputRef.current?.click()}
                          className="text-xs text-primary hover:underline"
                        >
                          {lang === "ar" ? "تغيير" : "Change"}
                        </button>
                        <button
                          onClick={() => setBrandForm((f) => ({ ...f, logo_url: "" }))}
                          className="text-xs text-destructive hover:underline"
                        >
                          {lang === "ar" ? "حذف" : "Remove"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingAsset}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-2 py-1.5 w-full hover:border-primary/50 transition-colors disabled:opacity-50"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        {uploadingAsset ? t.uploading : t.uploadLogo}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveBrandMemory}
                      className="flex-1 bg-primary text-primary-foreground text-xs font-bold py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {t.save}
                    </button>
                    <button
                      onClick={() => setShowBrandForm(false)}
                      className="flex-1 bg-muted border border-border text-foreground text-xs py-1.5 rounded-lg hover:bg-muted/80 transition-colors"
                    >
                      {t.cancel}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {t.loading}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.from === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {m.from === "hamzawi" && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary shrink-0 mt-1">
                    ح
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl text-sm leading-relaxed ${
                  m.from === "hamzawi"
                    ? "bg-muted text-foreground rounded-tr-none"
                    : "bg-primary text-primary-foreground rounded-tl-none"
                } ${m.imageUrl ? "overflow-hidden p-0" : "px-3 py-2 whitespace-pre-wrap"}`}>
                  {m.imageUrl ? (
                    <div>
                      <img
                        src={m.imageUrl}
                        alt="generated post"
                        className="w-full cursor-zoom-in"
                        onClick={() => window.open(m.imageUrl, "_blank")}
                      />
                      <div className="px-3 py-2 space-y-2">
                        <p className="text-xs text-muted-foreground">{m.text}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => downloadImage(m.imageUrl!)}
                            className="flex-1 flex items-center justify-center gap-1 bg-primary text-primary-foreground text-xs font-bold py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          >
                            <Download className="w-3 h-3" />
                            {t.download}
                          </button>
                          <button
                            onClick={handleRegenerateClick}
                            disabled={generatingPost}
                            className="flex-1 flex items-center justify-center gap-1 bg-muted border border-border text-foreground text-xs py-1.5 rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {t.regenerate}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {m.text}
                      <p className="text-[10px] opacity-50 mt-1 text-left">{m.time}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 flex-row">
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary shrink-0 mt-1">
                  ح
                </div>
                <div className="bg-muted rounded-2xl rounded-tr-none px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">{t.thinking}</span>
                </div>
              </div>
            )}
            {generatingPost && (
              <div className="flex gap-2 flex-row">
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary shrink-0 mt-1">
                  ح
                </div>
                <div className="bg-muted rounded-2xl rounded-tr-none px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">{t.generatingPost}</span>
                </div>
              </div>
            )}
            {checkResult?.status === "مرفوض" && messages.length > 0 && !loading && (
              <a
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(lang === "ar" ? "أريد الاشتراك في Smart Fix" : "I want to subscribe to Smart Fix")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-green-600 text-white text-center text-sm py-2.5 rounded-xl font-bold hover:bg-green-700 transition-colors"
              >
                📲 {lang === "ar" ? "اشترك في Smart Fix" : "Subscribe to Smart Fix"}
              </a>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-border p-2 shrink-0 flex gap-2 items-center">
            {/* Paperclip — hidden input */}
            <input ref={attachInputRef} type="file" accept="image/*" className="hidden" onChange={handleChatAttach} />
            <button
              onClick={() => attachInputRef.current?.click()}
              disabled={uploadingAsset || !localStorage.getItem(TOKEN_KEY)}
              title={t.attachTip}
              className="text-muted-foreground hover:text-primary transition-colors shrink-0 disabled:opacity-30"
            >
              {uploadingAsset
                ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                : <Paperclip className="w-4 h-4" />
              }
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
              placeholder={t.placeholder}
              disabled={loading}
              className={`flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 ${isRTL ? "text-right" : "text-left"} disabled:opacity-60`}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="bg-primary text-primary-foreground px-3 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Toggle bubble */}
      <button
        onClick={() => { setOpen(!open); setUnread(false); }}
        className="w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center hover:scale-105 transition-transform relative"
        title={isRTL ? "تحدث مع حمزاوي" : "Chat with Hamzawi"}
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <span className="text-xl font-black text-white">ح</span>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-background" />
            {unread && (
              <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background animate-pulse" />
            )}
          </>
        )}
      </button>
    </div>
  );
}
