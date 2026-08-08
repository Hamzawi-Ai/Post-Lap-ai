import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { OPENAI_API_KEY } from "../../lib/secrets";

let _openai: OpenAI | null = null;
let _gemini: GoogleGenAI | null = null;

const isProduction = process.env.NODE_ENV === "production";

/**
 * DEV-ONLY stub used when NODE_ENV !== "production" and no OPENAI_API_KEY is
 * configured. Lets the full pipeline (upload → analysis → response) be tested
 * without burning API credits. Production is untouched: without a real key the
 * real OpenAI client is created and requests fail as before.
 */
function devStubOpenAI(): OpenAI {
  const contentFrom = (
    messages: Array<{ content?: unknown }>,
  ): string =>
    messages
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content ?? ""),
      )
      .join("\n");

  return {
    chat: {
      completions: {
        create: async (params: { messages: Array<{ content?: unknown }> }) => {
          const prompt = contentFrom(params.messages);
          let content: string;
          if (prompt.includes("النوايا الممكنة")) {
            // P1 Reasoner disambiguation — return the matching intent.
            const msgMatch = prompt.match(/رسالة المستخدم:\s*(.+)/);
            const userMsg = msgMatch?.[1] ?? "";
            let intent = "check_ad";
            if (/صمم|تصميم|منشور|بوست|اعمل|أنشئ/i.test(userMsg)) intent = "generate_image";
            else if (/افحص|فحص|راجع|حلل|قيّم|شوف/i.test(userMsg)) intent = "check_ad";
            else if (/اكتب|نص إعلاني/i.test(userMsg)) intent = "generate_text";
            content = JSON.stringify({ intent });
          } else if (prompt.includes("رد فقط بـ JSON")) {
            content = JSON.stringify({
              status: "جيد",
              score: 82,
              violations: [
                {
                  type: "نسبة النص",
                  reason: "مساحة النص قريبة من الحد المسموح (20%).",
                  severity: "low",
                },
              ],
              suggestions: [
                "قلّل مساحة النص داخل الصورة لتظل تحت 20%.",
                "استخدم ألواناً أوضح للنص لزيادة التباين.",
              ],
            });
          } else if (prompt.includes("PostLab AI") || prompt.includes("أنت حمزاوي")) {
            content = "أهلاً بك! أنا PostLab AI، مساعدك التسويقي الذكي. اطلب مني تحليل إعلانك أو اكتب سؤالك وسأجيبك مباشرة.";
          } else if (prompt.includes("اكتب نص إعلاني") || prompt.includes("بناءً على صورة المنتج")) {
            content = "إعلانك جاهز ✨\n\nمنتجك يستحق أن يراه الجميع — جودة مميزة، خدمة موثوقة، وسعر مناسب. اطلب اليوم وتوصيل سريع لجميع المدن. 📦🔥";
          } else {
            content = "هذه استجابة تجريبية من وضع التطوير.";
          }
          return { choices: [{ message: { content } }] };
        },
      },
    },
  } as unknown as OpenAI;
}

export function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!isProduction && !OPENAI_API_KEY) {
      _openai = devStubOpenAI();
    } else {
      _openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    }
  }
  return _openai;
}

export function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY ?? process.env.NANO_BANANA_API_KEY ?? "";
    _gemini = new GoogleGenAI({ apiKey: key });
  }
  return _gemini;
}

export function isGeminiAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY);
}