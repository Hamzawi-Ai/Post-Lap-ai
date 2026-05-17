import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, BookmarkPlus, ChevronDown } from "lucide-react";

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
    style: "الأسلوب المفضل",
    notes: "ملاحظات",
    save: "حفظ",
    cancel: "إلغاء",
    upgradeMsg: "حفظ هوية النشاط متاح للمستخدمين المسجّلين فأعلى",
    welcome: "السلام عليكم! 👋 أنا حمزاوي، مساعدك الإعلاني الذكي. أقدر أساعدك في فحص إعلاناتك، اقتراح تحسينات، وتوليد محتوى تسويقي. كيف أخدمك؟",
    welcomeEn: "Hello! 👋 I'm Hamzawi, your smart advertising assistant. I can help you check your ads, suggest improvements, and generate marketing content. How can I help you?",
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
    style: "Preferred style",
    notes: "Notes",
    save: "Save",
    cancel: "Cancel",
    upgradeMsg: "Brand identity is available for registered users and above",
    welcome: "Hello! 👋 I'm Hamzawi, your smart advertising assistant. I can help you check your ads, suggest improvements, and generate marketing content. How can I help you?",
    welcomeEn: "Hello! 👋 I'm Hamzawi, your smart advertising assistant. How can I help you?",
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
  const [brandForm, setBrandForm] = useState({ business_name: "", business_type: "", preferred_style: "", notes: "" });
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [unread, setUnread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const t = i18n[lang];
  const level = planLevel(userPlan);

  useEffect(() => {
    setLang(detectLanguage());
  }, []);

  function addHamzawi(text: string) {
    setMessages((prev) => [...prev, { from: "hamzawi", text, time: now() }]);
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
        if (msgs.length > 0) {
          setMessages(msgs);
        }
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
    loadHistory().then(() => {
      if (!initialized) {
        setInitialized(true);
        setMessages((prev) => {
          if (prev.length === 0) {
            return [{ from: "hamzawi", text: t.welcome, time: now() }];
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
  }, [messages, loading]);

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

  const isRTL = lang === "ar";
  const dirAttr = isRTL ? "rtl" : "ltr";

  return (
    <div className={`fixed bottom-20 ${isRTL ? "left-4" : "right-4"} z-40 flex flex-col items-end gap-2`} dir={dirAttr}>
      {open && (
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-80 sm:w-96 flex flex-col overflow-hidden" style={{ height: "460px" }}>
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
              {level >= 2 && (
                <button
                  onClick={() => setShowBrandForm(!showBrandForm)}
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

          {/* Brand memory form */}
          {showBrandForm && (
            <div className="bg-muted/80 border-b border-border px-4 py-3 shrink-0 space-y-2">
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
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.from === "hamzawi"
                    ? "bg-muted text-foreground rounded-tr-none"
                    : "bg-primary text-primary-foreground rounded-tl-none"
                }`}>
                  {m.text}
                  <p className="text-[10px] opacity-50 mt-1 text-left">{m.time}</p>
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
            {checkResult?.status === "مرفوض" && messages.length > 0 && (
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

          {/* Input */}
          <div className="border-t border-border p-2 shrink-0 flex gap-2">
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
