import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, Sparkles, Paperclip, ScanLine } from "lucide-react";
import { brandProfileCompletion, type BrandProfileData } from "@/lib/onboarding";
import { chatRendererRegistry, type ChatRendererContext } from "@/components/chat";
import type { ChatBlock, BlockExtra, GeneratedImageBlock } from "@/lib/messages/types";
import { chatBlock, storedContentToBlock, replyToBlock } from "@/lib/messages/parser";
import { CARD_BLOCK_TYPES } from "@/lib/messages/types";

const LANG_KEY = "postlap_lang";
const SESSION_OPENED_KEY = "hamzawi_opened";
const TOKEN_KEY = "postlap_token";
const USER_KEY = "postlap_user";

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
    title: "PostLab",
    subtitle: "مساعدك التسويقي الذكي",
    placeholder: "اكتب رسالتك...",
    loading: "جاري التحميل...",
    thinking: "PostLab يفكر...",
    regenerate: "أعد التوليد",
    download: "حمّل الصورة",
    attachFile: "إرفاق صورة",
    copy: "نسخ",
    copied: "تم النسخ ✓",
    attachTip: "انقر لإرفاق صورة (شعار، تصميم سابق، أو صورة منتج)",
    regeneratePrompt: "ملاحظة للتوليد (اختياري):",
    checkAdTip: "ارفع صورة إعلانك للفحص",
    analyzingAd: "جاري تحليل إعلانك... ⏳",
    welcome: "أهلاً! 👋 أنا مساعد PostLab، مساعدك التسويقي الذكي. قلّي على نشاطك وأولّد لك منشوراتك ونصوصك الإعلانية بالليبي الأصيل، وأصمّم صورها بهوية نشاطك — وكمان أفحص إعلانك قبل النشر.",
    profileChip: "اكتمال هوية النشاط",
    quickStart: "ابدأ بسرعة",
    quickActions: [
      { label: "صمم منشور عرض", prompt: "صمم لي منشور عرض جذاب لنشاطي" },
      { label: "صمم Story", prompt: "صمم لي قصة (Story) للإعلان عن نشاطي" },
      { label: "اكتب إعلان ممول", prompt: "اكتب لي إعلاناً ممولاً جاهزاً للنشر عن نشاطي" },
      { label: "اقترح أفكار محتوى", prompt: "اقترح لي أفكار محتوى إعلاني لنشاطي" },
      { label: "صمم منشور ترحيبي", prompt: "صمم لي منشور ترحيبي لنشاطي" },
    ],
  },
  en: {
    title: "PostLab",
    subtitle: "Your AI marketing assistant",
    placeholder: "Type your message...",
    loading: "Loading...",
    thinking: "PostLab is thinking...",
    regenerate: "Regenerate",
    download: "Download Image",
    attachFile: "Attach image",
    copy: "Copy",
    copied: "Copied ✓",
    attachTip: "Click to attach an image (logo, design sample, or product photo)",
    regeneratePrompt: "Regeneration note (optional):",
    checkAdTip: "Upload your ad image to check it",
    analyzingAd: "Analyzing your ad... ⏳",
    welcome: "Hello! 👋 I'm PostLab, your AI marketing assistant. Tell me about your business and I'll generate your posts and ad copy in authentic Libyan, design visuals with your brand identity — and check your ads before you publish.",
    profileChip: "Brand profile completion",
    quickStart: "Quick start",
    quickActions: [
      { label: "Design offer post", prompt: "Design an attractive offer post for my business" },
      { label: "Design a Story", prompt: "Design a Story to advertise my business" },
      { label: "Write sponsored ad", prompt: "Write a ready-to-publish sponsored ad for my business" },
      { label: "Content ideas", prompt: "Suggest advertising content ideas for my business" },
      { label: "Design welcome post", prompt: "Design a welcome post for my business" },
    ],
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
  /** Temporary Beta access — elevates the effective capability level to full
   * (level 4) without faking a paid plan. Mirrors the server-side beta grant. */
  betaAccess?: boolean;
  onFileCheck?: (file: File) => void;
  checking?: boolean;
  heroVisible?: boolean;
  forceOpen?: number;
  embedded?: boolean;
  /** When set, the chat displays this conversation's history. Pass null to start a fresh thread. */
  conversationId?: string | null;
  /** Called with the newly-created conversation id the first time a message is sent in a fresh thread. */
  onConversationCreated?: (id: string) => void;
}

/**
 * UX-1: messages are typed ChatBlocks rendered via the chatRendererRegistry.
 * The legacy { text, imageUrl, isGeneratedPost, ... } shape is handled by
 * chatBlock()/storedContentToBlock()/replyToBlock() in lib/messages/parser.
 */

// Payload kept for regeneration — never cleared when form resets
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

// Temporary Beta access — full capability level (content-plan equivalent).
// Mirrors BETA_LEVEL in api-server/src/services/beta/access.ts.
const BETA_LEVEL = 4;

export default function HamzawiChat({ gender, checkResult, whatsapp, userPlan, betaAccess, onFileCheck, checking, heroVisible, forceOpen, embedded, conversationId, onConversationCreated }: HamzawiChatProps) {
  const [open, setOpen] = useState(!!embedded);
  const [messages, setMessages] = useState<ChatBlock[]>([]);
  const [input, setInput] = useState("");
  const [initialized, setInitialized] = useState(false);
  const lastReportedCheckRef = useRef<typeof checkResult>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  // Incremented on every login event so effects that depend on it re-run
  // even when `open` is already true.
  const [sessionVersion, setSessionVersion] = useState(0);
  const sessionVersionRef = useRef(0);
  const objectUrlsRef = useRef<string[]>([]);
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [unread, setUnread] = useState(false);
  const [brandMemory, setBrandMemory] = useState<BrandProfileData | null>(null);

  // Upload state
  const [uploadingAsset, setUploadingAsset] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const checkAdInputRef = useRef<HTMLInputElement>(null);

  // Image the user attached that will be sent with the next chat message.
  // Set after a paperclip upload, cleared once consumed by sendMessage.
  const pendingAttachmentRef = useRef<{ url?: string; dataUrl?: string } | null>(null);
  // Last file selected for the ad-check button, so the follow-up chat turn can
  // attach the same image (the check endpoint itself does not persist it).
  const adCheckFileRef = useRef<File | null>(null);

  const t = i18n[lang];
  // Beta users get full capability level without faking a paid plan.
  const level = Math.max(planLevel(userPlan), betaAccess ? BETA_LEVEL : 0);

  /** Reads a File into a base64 data URL (used to attach ad-check images to chat). */
  function fileToDataUrl(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  useEffect(() => {
    setLang(detectLanguage());
  }, []);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  // Reset chat when the user logs in so guest messages are cleared and
  // the authenticated user's history is loaded fresh.
  // Uses a custom "postlap:login" event (dispatched by setToken in utils.ts)
  // so the reset fires in the *same* tab that performed the login, not just
  // cross-tab via the native storage event.
  useEffect(() => {
    function handleLogin() {
      // Bump the version ref first so any in-flight guest history fetch
      // can detect it has been superseded and discard its results.
      sessionVersionRef.current += 1;
      const v = sessionVersionRef.current;
      setMessages([]);
      setHistoryLoaded(false);
      setInitialized(false);
      // Issue 4: forget the previously selected conversation so the
      // conversationId effect re-runs after an account switch even when the prop
      // value is unchanged. This prevents a stale conversation id from the
      // previous account surviving into the new authenticated context.
      prevConversationIdRef.current = undefined;
      // Increment state version — this causes the open effect to re-run
      // even though `open` itself hasn't changed, triggering history reload
      // and initialization for the now-authenticated user.
      setSessionVersion(v);
    }

    window.addEventListener("postlap:login", handleLogin);
    return () => window.removeEventListener("postlap:login", handleLogin);
  }, []);

  // Load brand profile once for authenticated users → completion badge + quick actions
  useEffect(() => {
    if (level < 2) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/hamzawi/memory", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { memory?: BrandProfileData | null };
          if (data.memory) setBrandMemory(data.memory);
        }
      } catch {
        // non-critical — badge just stays hidden
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completion = brandProfileCompletion(brandMemory);
  const hasUserMessage = messages.some((m) => m.from === "user");
  const showQuickActions = !hasUserMessage && messages.length > 0 && !loading;

  function addHamzawi(text: string, extra?: BlockExtra) {
    setMessages((prev) => [...prev, chatBlock("hamzawi", text, extra)]);
    if (!open) setUnread(true);
  }

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoaded(true);
    // Snapshot the session version at call-time so we can detect a login
    // that fires while this fetch is in-flight and discard stale results.
    const versionAtStart = sessionVersionRef.current;
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch("/api/hamzawi/messages", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // If login happened while we were fetching, bail — the open effect
      // will re-run and call a fresh loadHistory with the correct token.
      if (sessionVersionRef.current !== versionAtStart) return;
      if (res.ok) {
        const data = await res.json();
        const msgs: ChatBlock[] = (data.messages ?? []).map((m: any) => {
          const time = new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
          return storedContentToBlock(m.content, m.role === "assistant" ? "hamzawi" : "user", time);
        });
        if (msgs.length > 0) setMessages(msgs);
      }
    } catch {
      console.error("Failed to load chat history");
    }
  }, [historyLoaded]);

  // Auto-open: only fire immediately when there is no inline hero; otherwise wait for hero to scroll away
  useEffect(() => {
    if (embedded) return;
    const hasOpened = sessionStorage.getItem(SESSION_OPENED_KEY);
    if (hasOpened) return;
    // If a hero section is present (heroVisible defined), let the heroVisible effect handle opening
    if (heroVisible !== undefined) return;
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(SESSION_OPENED_KEY, "1");
      setUnread(false);
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When hero scrolls out of view for the first time → auto-open floating chat
  const prevHeroVisibleRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (embedded || heroVisible === undefined) return;
    const justScrolledPast = prevHeroVisibleRef.current === true && heroVisible === false;
    prevHeroVisibleRef.current = heroVisible;
    if (!justScrolledPast) return;
    const hasOpened = sessionStorage.getItem(SESSION_OPENED_KEY);
    if (hasOpened) return;
    setOpen(true);
    sessionStorage.setItem(SESSION_OPENED_KEY, "1");
    setUnread(false);
  }, [heroVisible]);

  // forceOpen: increment counter from parent to open chat on demand
  const prevForceOpenRef = useRef<number>(0);
  useEffect(() => {
    if (embedded || !forceOpen || forceOpen === prevForceOpenRef.current) return;
    prevForceOpenRef.current = forceOpen;
    setOpen(true);
    setUnread(false);
  }, [forceOpen]);

  // conversationId: manages all message loading in workspace mode (when the prop is defined).
  // When undefined (floating chat), this effect is a no-op — the open effect handles it.
  // When null (new chat) or a string (selected conversation), this effect owns the full
  // load cycle and marks historyLoaded=true so the open effect never calls loadHistory.
  const prevConversationIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Not in workspace mode — nothing to do here.
    if (conversationId === undefined) return;

    // Identical to previous value — skip.
    if (conversationId === prevConversationIdRef.current) return;
    prevConversationIdRef.current = conversationId ?? null;

    // Suppress the open effect's loadHistory for the lifetime of this component.
    setHistoryLoaded(true);
    setInitialized(true);
    setMessages([]);

    if (!conversationId) {
      // New-chat: show welcome message immediately, no API call needed.
      setMessages([chatBlock("hamzawi", t.welcome)]);
      return;
    }

    // Fetch messages for the selected conversation.
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setMessages([chatBlock("hamzawi", t.welcome)]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hamzawi/messages?conversationId=${conversationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const msgs: ChatBlock[] = (data.messages ?? []).map((m: any) => {
            const time = new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
            return storedContentToBlock(m.content, m.role === "assistant" ? "hamzawi" : "user", time);
          });
          if (!cancelled) setMessages(msgs.length > 0 ? msgs : [chatBlock("hamzawi", t.welcome)]);
        }
      } catch {
        if (!cancelled) console.error("Failed to load conversation messages");
      }
    })();
    // Cleanup: mark as cancelled so a stale request cannot overwrite a newer conversation's messages.
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!open) return;
    setUnread(false);
    // In workspace mode (conversationId prop is defined), all history loading is owned by
    // the conversationId effect above. Never call loadHistory here to avoid fetching all
    // unscoped history when conversationId is null (new-chat state).
    if (conversationId !== undefined) return;
    loadHistory().then(async () => {
      if (!initialized) {
        setInitialized(true);

        // For level 4+ authenticated users with no history, auto-start onboarding
        const token = localStorage.getItem(TOKEN_KEY);
        if (level >= 4 && token) {
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            // Temporary loading state — will be replaced by AI response
            return [chatBlock("hamzawi", "...")];
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
                  const withoutPlaceholder = prev.filter((m) => m.type === "text" && m.text !== "...");
                  return [...withoutPlaceholder, chatBlock("hamzawi", data.reply!)];
                });
                return;
              }
            }
          } catch {
            console.error("Failed to init chat onboarding");
          }
          // Fallback: remove placeholder and show static welcome
          setMessages((prev) => {
            const withoutPlaceholder = prev.filter((m) => m.type === "text" && m.text !== "...");
            if (withoutPlaceholder.length === 0) {
              return [chatBlock("hamzawi", t.welcome)];
            }
            return withoutPlaceholder;
          });
          return;
        }

        setMessages((prev) => {
          if (prev.length === 0) {
            return [chatBlock("hamzawi", t.welcome)];
          }
          return prev;
        });
      }
    });
  // sessionVersion is included so this effect re-runs on login even when
  // open is already true, giving the authenticated user a fresh session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionVersion]);

  useEffect(() => {
    if (!checkResult) return;
    if (lastReportedCheckRef.current === checkResult) return;
    lastReportedCheckRef.current = checkResult;
    // Auto-open chat so the result is visible
    if (!open) {
      setOpen(true);
      setUnread(false);
    }
    const report = {
      status: checkResult.status,
      score: checkResult.score,
      violations: checkResult.violations,
      suggestions: checkResult.suggestions,
    };
    const autoMsg = lang === "ar"
      ? `تحقق من نتيجة فحص الإعلان وأخبرني بتوصياتك`
      : `Check the ad review result and tell me your recommendations`;
    // Attach the checked ad image to this follow-up turn so Hamzawi can see the
    // actual ad (the check endpoint analyses it but does not persist it for chat).
    const file = adCheckFileRef.current;
    adCheckFileRef.current = null;
    if (file && file.type.startsWith("image/")) {
      fileToDataUrl(file).then((dataUrl) => {
        if (dataUrl) {
          sendMessage(autoMsg, report, { dataUrl });
        } else {
          sendMessage(autoMsg, report);
        }
      });
    } else {
      sendMessage(autoMsg, report);
    }
  }, [checkResult]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(
    text?: string,
    checkReport?: HamzawiChatProps["checkResult"] | null,
    attachment?: { url?: string; dataUrl?: string } | null,
  ) {
    const msgText = text ?? input.trim();
    if (!msgText) return;
    if (!text) setInput("");

    // The uploaded image rides along with the next outgoing message, so the AI
    // always receives it. One-shot: consumed once sent (unless explicitly passed).
    const attach = attachment ?? pendingAttachmentRef.current ?? null;
    if (!attachment) pendingAttachmentRef.current = null;

    setMessages((prev) => [...prev, chatBlock("user", msgText)]);
    setLoading(true);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch("/api/hamzawi/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: msgText,
          checkReport: checkReport ?? null,
          ...(attach ? { attachment: attach } : {}),
          ...(conversationId ? { conversationId: parseInt(conversationId, 10) } : {}),
        }),
      });

      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        addHamzawi(lang === "ar" ? "انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى." : "Session expired. Please log in again.");
      } else if (res.ok) {
        const data = await res.json();
        // Notify workspace when a new conversation was auto-created on the first message.
        if (data.conversationId && !conversationId && onConversationCreated) {
          onConversationCreated(String(data.conversationId));
        }
        setMessages((prev) => [...prev, replyToBlock(data, "hamzawi", now())]);
      } else {
        addHamzawi(lang === "ar" ? "عذراً، حدث خطأ. حاول مرة أخرى." : "Sorry, an error occurred. Please try again.");
      }
    } catch {
      addHamzawi(lang === "ar" ? "تعذر الاتصال. تحقق من الإنترنت." : "Connection failed. Check your internet.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Upload a file to the backend upload-asset endpoint.
   * Returns the public URL or null on failure.
   */
  async function uploadAsset(file: File, category: "logo" | "portfolio" | "generated" | "products" | "documents" = "portfolio"): Promise<string | null> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    setUploadingAsset(true);
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
   * Ad check file input handler.
   * Shows image preview in chat, opens the chat, then calls onFileCheck.
   */
  function handleAdCheckFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // Remember the file so the auto follow-up chat message can attach the same
    // image to the AI turn (the /api/check endpoint does not persist it).
    adCheckFileRef.current = file;

    // Open chat if not already open
    if (!open) {
      setOpen(true);
      setUnread(false);
    }

    // Show image preview in user message bubble (images only)
    if (file.type !== "video/mp4") {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      setMessages((prev) => [
        ...prev,
        chatBlock("user", lang === "ar" ? "افحص هذا الإعلان" : "Check this ad", { imageUrl: url }),
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        chatBlock("user", lang === "ar" ? "افحص هذا الفيديو الإعلاني" : "Check this video ad"),
      ]);
    }

    onFileCheck?.(file);
  }

  /**
   * Paperclip attachment in main chat.
   * Uploads to backend and saves the returned URL as a Hamzawi message (for context/logo).
   */
  async function handleChatAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // Determine category before uploading.
    // If we're in onboarding with no logo yet → "logo".
    // Otherwise → "portfolio" (design samples and general attachments).
    let attachCategory: "logo" | "portfolio" = "portfolio";
    if (level >= 4) {
      // Check if user already has a logo to decide category ahead of upload
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          const memRes = await fetch("/api/hamzawi/memory", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const memData = memRes.ok
            ? (await memRes.json() as { memory?: { logo_url?: string | null } | null })
            : {};
          if (!memData.memory?.logo_url) attachCategory = "logo";
        } catch {
          // If check fails, default to portfolio
        }
      }
    }

    const url = await uploadAsset(file, attachCategory);
    if (!url) {
      addHamzawi(lang === "ar" ? "حدث خطأ أثناء رفع الصورة." : "Error uploading image.");
      return;
    }

    // Attach the uploaded image to the next chat message so Hamzawi sees it
    // immediately (not only in later brand-asset vision turns).
    pendingAttachmentRef.current = { url };

    // Show the uploaded image as a user-side media bubble in the chat.
    setMessages((prev) => [...prev, chatBlock("user", "", { imageUrl: url })]);

    if (level >= 4) {
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
            const logoRes = await fetch("/api/hamzawi/memory", {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ logo_url: url, source: "settings" }),
            });
            if (!logoRes.ok) {
              const data = await logoRes.json().catch(() => ({}));
              addHamzawi((data as { error?: string }).error ?? (lang === "ar" ? "حدث خطأ أثناء حفظ الشعار." : "Error saving logo."));
              return;
            }
            addHamzawi(
              lang === "ar"
                ? "تم حفظ الشعار في هوية نشاطك ✅ الآن يمكنك رفع تصاميم سابقة إضافية بنفس الطريقة، أو اكتب 'تخطّ' للمتابعة."
                : "Logo saved to your brand identity ✅ You can now upload previous design samples the same way, or type 'skip' to continue."
            );
          } else {
            // Subsequent uploads: append as design sample
            const sampleRes = await fetch("/api/hamzawi/memory", {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ append_design_sample: url, source: "settings" }),
            });
            if (!sampleRes.ok) {
              const data = await sampleRes.json().catch(() => ({}));
              addHamzawi((data as { error?: string }).error ?? (lang === "ar" ? "حدث خطأ أثناء حفظ التصميم." : "Error saving design sample."));
              return;
            }
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

  function downloadImage(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `postlab-post-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleRegenerateClick() {
    // Chat-generated design — ask Hamzawi to regenerate it in a new turn.
    const lastGenMsg = [...messages].reverse().find(
      (m): m is GeneratedImageBlock => m.type === "generated_image" && !!m.description,
    );
    if (!lastGenMsg?.description) return;
    const note = prompt(t.regeneratePrompt) ?? "";
    sendMessage(
      lang === "ar"
        ? `أعد توليد التصميم السابق: ${lastGenMsg.description}${note ? ` (ملاحظة: ${note})` : ""}`
        : `Regenerate the previous design: ${lastGenMsg.description}${note ? ` (Note: ${note})` : ""}`
    );
  }

  const isRTL = lang === "ar";
  const dirAttr = isRTL ? "rtl" : "ltr";

  // Shared context handed to every chat renderer via the RendererRegistry.
  const renderCtx: ChatRendererContext = {
    lang,
    t: { download: t.download, regenerate: t.regenerate, copy: t.copy, copied: t.copied },
    onDownload: downloadImage,
    onRegenerate: handleRegenerateClick,
    onCopy: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard unavailable — no-op
      }
    },
  };

  return (
    <div className={`${embedded ? "w-full h-full" : `fixed bottom-20 ${isRTL ? "left-4" : "right-4"} z-40 flex flex-col items-end gap-2`}`} dir={dirAttr}>
      {(open || embedded) && (
        <div className={`bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden ${embedded ? "w-full h-full" : "w-80 sm:w-96"}`} style={{ height: embedded ? "100%" : "520px" }}>
          {/* Header */}
          <div className="bg-primary px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg font-black text-white">
                P
              </div>
              <div>
                <p className="text-sm font-bold text-white">{t.title}</p>
                <p className="text-xs text-white/70">{t.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {level >= 2 && brandMemory !== null && completion.percent < 100 && (
                <a
                  href="/brand"
                  title={t.profileChip}
                  className="text-white/90 hover:text-white transition-colors text-[10px] font-bold px-2 py-1 rounded-lg border border-white/25 bg-white/10 flex items-center gap-1"
                >
                  {t.profileChip}: {completion.percent}%
                </a>
              )}
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {t.loading}
              </div>
            )}
            {messages.map((m, i) => {
              const Renderer = chatRendererRegistry.get(m.type);
              const isCard = CARD_BLOCK_TYPES.has(m.type);
              return (
                <div key={i} className={`flex gap-2 ${m.from === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  {m.from === "hamzawi" && (
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary shrink-0 mt-1">
                      P
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl text-sm leading-relaxed ${
                    m.from === "hamzawi"
                      ? "bg-muted text-foreground rounded-tr-none"
                      : "bg-primary text-primary-foreground rounded-tl-none"
                  } ${isCard ? "overflow-hidden p-0" : "px-3 py-2 whitespace-pre-wrap"}`}>
                    {Renderer ? <Renderer block={m} ctx={renderCtx} /> : null}
                  </div>
                </div>
              );
            })}
            {checking && (
              <div className="flex gap-2 flex-row">
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary shrink-0 mt-1">
                  P
                </div>
                <div className="bg-muted rounded-2xl rounded-tr-none px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">{t.analyzingAd}</span>
                </div>
              </div>
            )}
            {loading && (
              <div className="flex gap-2 flex-row">
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-black text-primary shrink-0 mt-1">
                  P
                </div>
                <div className="bg-muted rounded-2xl rounded-tr-none px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">{t.thinking}</span>
                </div>
              </div>
            )}
            {(checkResult?.status === "مرفوض" || checkResult?.status === "جيد" || checkResult?.status === "rejected" || checkResult?.status === "good") && messages.length > 0 && !loading && !checking && level < 4 && (
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

          {/* Quick actions — shortcuts to start a conversation (shortcuts only) */}
          {showQuickActions && (
            <div className="border-t border-border px-3 py-2 shrink-0 space-y-1.5 bg-muted/40">
              <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" />
                {t.quickStart}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {t.quickActions.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => sendMessage(qa.prompt)}
                    className="text-xs bg-background border border-border text-foreground px-2.5 py-1.5 rounded-lg hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input bar */}
          <div className="border-t border-border p-2 shrink-0 flex gap-2 items-center">
            {/* Ad check button — available to all users */}
            <input ref={checkAdInputRef} type="file" accept="image/png,image/jpeg,video/mp4" className="hidden" onChange={handleAdCheckFile} />
            <button
              onClick={() => checkAdInputRef.current?.click()}
              disabled={checking}
              title={t.checkAdTip}
              className="text-muted-foreground hover:text-primary transition-colors shrink-0 disabled:opacity-30"
            >
              {checking
                ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                : <ScanLine className="w-4 h-4" />
              }
            </button>
            {/* Paperclip — logo/asset upload for authenticated users */}
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
              data-testid="chat-input"
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

      {/* Toggle bubble — hidden while the inline hero chat is visible so the two don't overlap */}
      {!embedded && (
      <button
        onClick={() => { setOpen(!open); setUnread(false); }}
        className={`w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center hover:scale-105 transition-all duration-300 relative ${heroVisible ? "opacity-0 pointer-events-none scale-75" : "opacity-100 scale-100"}`}
        title={isRTL ? "تحدث مع PostLab" : "Chat with PostLab"}
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <span className="text-xl font-black text-white">P</span>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-background" />
            {unread && (
              <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background animate-pulse" />
            )}
          </>
        )}
      </button>
      )}
    </div>
  );
}
