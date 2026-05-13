import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Bot } from "lucide-react";

interface HamzawiChatProps {
  gender: "male" | "female" | null;
  checkResult: { status: string; score: number } | null;
  whatsapp: string;
}

interface Message {
  from: "hamzawi" | "user";
  text: string;
  time: string;
}

function now() {
  return new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

export default function HamzawiChat({ gender, checkResult, whatsapp }: HamzawiChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [greeted, setGreeted] = useState(false);
  const [resultMsgSent, setResultMsgSent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addressMale = ["يا غالي", "يا طيب", "أخوي"];
  const addressFemale = ["يا أبلة", "عزيزتي", "صديقتي"];
  const address =
    gender === "female"
      ? addressFemale[Math.floor(Math.random() * addressFemale.length)]
      : addressMale[Math.floor(Math.random() * addressMale.length)];

  // Initial greeting when chat opens
  useEffect(() => {
    if (open && !greeted) {
      setTimeout(() => {
        addHamzawi(
          `السلام عليكم ${address}! 👋 أنا حمزاوي، مصمم ومسوّق ليبي محترف. كيف أقدر أساعدك اليوم؟`
        );
        setGreeted(true);
      }, 400);
    }
  }, [open]);

  // React to check result
  useEffect(() => {
    if (!checkResult || resultMsgSent || !open) return;
    setResultMsgSent(true);
    setTimeout(() => {
      if (checkResult.status === "ممتاز") {
        addHamzawi(
          `ماشاء الله ${address}! 🎉 إعلانك ممتاز وجاهز للنشر. تبي أولّد له نص تسويقي بالليبي الأصيل؟ انزل لقسم توليد النص 👇`
        );
      } else if (checkResult.status === "جيد") {
        addHamzawi(
          `${address}، الإعلان مقبول بس وصوله سيكون محدود. 🤔 تبي نصلحه؟ اشترك في خطة Smart Fix وأنا أصلح لك الإعلان احترافياً في دقائق ⚡`
        );
      } else {
        addHamzawi(
          `${address}، للأسف الإعلان سيتم رفضه من المنصة. 😬 لا تقلق! خطة Smart Fix تصلح الإعلان وتجعله متوافقاً 100%. تبي تشترك؟ 👇`
        );
      }
    }, 600);
  }, [checkResult, open]);

  function addHamzawi(text: string) {
    setMessages((prev) => [...prev, { from: "hamzawi", text, time: now() }]);
  }

  function sendMessage() {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { from: "user", text: userMsg, time: now() }]);

    // Auto-reply logic
    setTimeout(() => {
      const lower = userMsg.toLowerCase();
      if (lower.includes("سعر") || lower.includes("اشتراك") || lower.includes("كم")) {
        addHamzawi(
          `أسعارنا ${address}:\n🔧 Smart Fix: 400 د.ل/شهر\n📊 إدارة المحتوى: 800 د.ل/شهر\n🏢 خطة الوكالة: 1000 د.ل + 400/مشروع إضافي\n\nتواصل معنا على واتساب للاشتراك 👇`
        );
      } else if (lower.includes("تصحيح") || lower.includes("إصلاح") || lower.includes("fix")) {
        addHamzawi(
          `بكل سرور ${address}! Smart Fix يصلح إعلانك ويجعله جاهز للنشر. انزل لقسم الخطط وسجّل اهتمامك 🚀`
        );
      } else if (lower.includes("وكال") || lower.includes("agency")) {
        addHamzawi(
          `خطة الوكالة مثالية للشركات ${address}! تقدر تدير عدة مشاريع كل واحد بهويته البصرية. تواصل معنا على واتساب لمعرفة التفاصيل 📲`
        );
      } else if (lower.includes("مرحبا") || lower.includes("هلا") || lower.includes("السلام")) {
        addHamzawi(`وعليكم السلام ${address}! كيف حالك؟ كيف أقدر أخدمك؟ 😊`);
      } else {
        addHamzawi(
          `فهمت عليك ${address}! للمزيد من المساعدة تواصل معنا مباشرة على واتساب وأنا شخصياً سأتابع معك 💬`
        );
      }
    }, 900);
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="fixed bottom-20 left-4 z-40 flex flex-col items-end gap-2" dir="rtl">
      {/* Chat window */}
      {open && (
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-80 sm:w-96 flex flex-col overflow-hidden" style={{ height: "440px" }}>
          {/* Header */}
          <div className="bg-primary px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg font-black text-white">
                ح
              </div>
              <div>
                <p className="text-sm font-bold text-white">حمزاوي</p>
                <p className="text-xs text-white/70">مصمم ومسوّق محترف</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                جاري تحميل المساعد...
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
            {/* WhatsApp CTA if check result rejected */}
            {checkResult?.status === "مرفوض" && messages.length > 0 && (
              <a
                href={`https://wa.me/${whatsapp}?text=أريد الاشتراك في Smart Fix`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-green-600 text-white text-center text-sm py-2.5 rounded-xl font-bold hover:bg-green-700 transition-colors"
              >
                📲 اشترك في Smart Fix
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
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="اكتب رسالتك..."
              className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 text-right"
            />
            <button
              onClick={sendMessage}
              className="bg-primary text-primary-foreground px-3 py-2 rounded-xl hover:opacity-90 transition-opacity"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Toggle bubble */}
      <button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center hover:scale-105 transition-transform relative"
        title="تحدث مع حمزاوي"
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <span className="text-xl font-black text-white">ح</span>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-background" />
          </>
        )}
      </button>
    </div>
  );
}
