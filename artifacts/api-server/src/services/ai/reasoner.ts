/**
 * Reasoner (P1) — intent classification that decides ROUTING ONLY.
 *
 * Design decision (approved): no LLM Reasoner per message. Deterministic
 * intents are handled by a lightweight rule-based shortcut first; only
 * ambiguous/compound requests invoke the LLM for disambiguation.
 *
 * P1 scope: the Reasoner improves routing only — vision-model choice,
 * onboarding state, markers, and upsell messaging. Tool EXECUTION is NOT
 * migrated yet; legacy endpoints remain the compatibility layer.
 */
import { getOpenAI } from "./client";
import { toolRegistry } from "./tools";

export type HamzawiIntent =
  | "check_ad"
  | "generate_image"
  | "generate_text"
  | "brand_memory"
  | "general_chat";

export interface IntentDecision {
  intent: HamzawiIntent;
  /** "rule" = deterministic shortcut; "llm" = ambiguous/compound, model-assisted */
  source: "rule" | "llm";
  /** Whether the turn needs the vision model (brand/design images attached). */
  needsVision: boolean;
}

const TEXT_MODEL = "gpt-4o-mini";

// ── Vision routing ───────────────────────────────────────────────────────────
// Intent-based detection of whether the request needs image understanding
// (logo/product recognition, design analysis, brand-asset reasoning). Driven
// by intent phrases; a small keyword list is a fallback. Normal text
// conversations stay on the cheaper text model. Patterns kept byte-identical
// to the pre-P1 inline logic so routing behaviour is unchanged.
function detectImageIntent(message: string): boolean {
  const m = message.trim();
  if (!m) return false;

  const intentPatterns = [
    /(صمم|صمّم|اصمم|تصميم|تصاميم)\b/i,
    /(اعمل|أنشئ|أعمل|انشئ|أُنشئ|اجعل).*(منشور|بوست|ستوري|قصة|بانر|فلاير|ملصق|بوستر|إعلان مرئي)/i,
    /(منشور|بوست|ستوري|بانر|فلاير|ملصق|بوستر)\b/i,
    /شعار|لوجو|logo/i,
    /ألوان|الوان|color/i,
    /هوية (بصرية|النشاط|نشاطي)/i,
    /(في|على) (الصورة|المنشور|التصميم|الشعار)/i,
    /ما رأيك (في|ب)/i,
    /(حلل|راجع|قيّم|قييم|شوف|بصّ|انظر|أنظر).*(منشور|صورة|تصميم|إعلان|شعار)/i,
    /صورة (المنتج|نشاطي|المنشور|الإعلان)|صور (المنتج|نشاطي)/i,
    /design|poster|banner|flyer|thumbnail|logo|post|image|photo|picture|visual/i,
    /brand (colors|identity|logo)/i,
  ];

  for (const re of intentPatterns) {
    if (re.test(m)) return true;
  }

  const fallbackKeywords = [
    "صمم", "تصميم", "منشور", "بوست", "ستوري", "شعار", "صورة", "بانر",
    "فلاير", "بوستر", "ألوان", "هوية", "تصاميم", "انشئ", "اعمل",
    "design", "post", "story", "banner", "logo", "image", "photo", "picture", "poster",
  ];
  return fallbackKeywords.some((k) => m.includes(k));
}

// ── Intent shortcuts (deterministic, rule-first) ─────────────────────────────
const CHECK_AD_PATTERNS = [
  /افحص|فحص|فحصلي|افحصلي/i,
  /(راجع|حلل|قيّم|قييم|شوف|بصّ|بص|انظر|أنظر).*(إعلان|منشور|صورة|تصميم|شعار)/i,
  /ما رأيك (في|ب)/i,
  /هل (هذا|هذه|في)? (مطابق|مخالف|مسموح|مقبول|جيد)/i,
  /check|review|analyze (this )?(ad|post|image|design)/i,
];

const GENERATE_IMAGE_PATTERNS = [
  // Arabic design verbs
  /(صمم|صمّم|اصمم|تصميم|تصاميم)\b/i,
  // Arabic action verbs + visual nouns
  /(اعمل|أنشئ|أعمل|انشئ|أُنشئ|اجعل|اريد|أريد|عايز|احتاج|ابتكر|ابدع|خلّق|خلق|صور).*(منشور|بوست|ستوري|قصة|بانر|فلاير|ملصق|بوستر|صورة|إعلان|تصميم|هوية)/i,
  // Standalone Arabic visual nouns indicating creation intent
  /(منشور|بوست|ستوري|بانر|فلاير|ملصق|بوستر).*(بهوية|بألوان|تصميم|اعمله|صممه|أنشئه)/i,
  // Asset-referencing requests (Arabic): "use the logo I uploaded", etc.
  /(استخدم|استعمل|استخدمي|استعملي).*(الشعار|اللوجو|logo|الصورة|المنشور|التصميم)/i,
  /باستخدام (الشعار|اللوجو|logo|الصورة|الهوية|التصميم|الشعار اللي رفعته)/i,
  // English design patterns
  /design (a|this|my)? ?(post|banner|flyer|story|image|graphic|visual|ad)/i,
  /\b(make|create|generate|build|put together|draw up)\b.*(post|banner|flyer|story|image|graphic|visual|ad|design)/i,
  // English asset-referencing requests
  /using (my|the) (logo|image|photo|asset|brand)/i,
  /use (my|the) (logo|image|photo|uploaded)/i,
  // Arabic: "I want a design / visual"
  /(أريد|اريد|عايز|محتاج|ابغى).*(تصميم|صورة|منشور|بوست)/i,
  // English informal: "put together a visual", "whip up a post"
  /\b(whip up|put together|come up with|make me)\b.*(post|image|graphic|visual|banner|design)/i,
];

const GENERATE_TEXT_PATTERNS = [
  /اكتب\s*(لي\s*)?(نص|إعلان|بوست|منشور|تصميم)/i,
  /(نص|إعلان) (إعلاني|دعائي|مكتوب)/i,
  /كتابة (نص|إعلان|بوست)/i,
  /write (an? )?(ad|copy|post)/i,
  /ad copy/i,
];

const BRAND_MEMORY_PATTERNS = [
  /احفظ|تذكر|ذاكرتي|ذاكرتك/i,
  /(ما|مين) ذاكرتك/i,
  /(عُدّد|اذكر|قل) (لي )?معلومات نشاطي/i,
  /معلومات (نشاطي|النشاط|هويتي)/i,
];

function matchesAny(patterns: RegExp[], m: string): boolean {
  return patterns.some((re) => re.test(m));
}

function ruleIntent(m: string): HamzawiIntent[] {
  const matched: HamzawiIntent[] = [];
  if (matchesAny(CHECK_AD_PATTERNS, m)) matched.push("check_ad");
  if (matchesAny(GENERATE_IMAGE_PATTERNS, m)) matched.push("generate_image");
  if (matchesAny(GENERATE_TEXT_PATTERNS, m)) matched.push("generate_text");
  if (matchesAny(BRAND_MEMORY_PATTERNS, m)) matched.push("brand_memory");
  return matched;
}

/**
 * LLM disambiguation — invoked ONLY for ambiguous/compound requests where the
 * rule shortcut matched more than one tool intent (e.g. "راجع منشوري وصمم لي
 * غيره"). Uses the ToolRegistry so newly registered tools are announced to the
 * model automatically.
 */
async function disambiguateWithLLM(
  message: string,
  candidates: HamzawiIntent[],
): Promise<HamzawiIntent> {
  const toolsSummary = toolRegistry.describeAll();
  const prompt = `المستخدم يريد فعل أكثر من شيء بنفس الرسالة. اختر النية الأهم فقط.
النوايا الممكنة: ${candidates.join(", ")}
رد فقط بـ JSON بالشكل: {"intent": "النية"}

الأدوات المتاحة:
${toolsSummary}

رسالة المستخدم: ${message}`;

  try {
    const resp = await getOpenAI().chat.completions.create({
      model: TEXT_MODEL,
      max_tokens: 30,
      messages: [{ role: "user", content: prompt }],
    });
    const content = resp.choices[0]?.message?.content ?? "";
    const match = content.match(/"intent"\s*:\s*"([^"]+)"/);
    if (match && (candidates as string[]).includes(match[1])) {
      return match[1] as HamzawiIntent;
    }
  } catch (e) {
    // Fall through to the tie-break default below.
  }

  // Tie-break: if candidates include generate_image and any image-generation
  // keyword appears in the input, prefer generate_image over check_ad or other
  // candidates to avoid swallowing legitimate design requests.
  if (candidates.includes("generate_image") && matchesAny(GENERATE_IMAGE_PATTERNS, message)) {
    return "generate_image";
  }
  return candidates[0];
}

/**
 * Entry point: classify the user's message into one intent.
 *
 * Rule-first (no per-message LLM cost); only ambiguous/compound matches reach
 * the model. needsVision reuses the original vision-routing logic unchanged.
 */
export async function classifyIntent(message: string): Promise<IntentDecision> {
  const m = message?.trim() ?? "";
  const needsVision = detectImageIntent(m);

  if (!m) {
    return { intent: "general_chat", source: "rule", needsVision };
  }

  const matched = ruleIntent(m);
  if (matched.length === 0) {
    return { intent: "general_chat", source: "rule", needsVision };
  }
  if (matched.length === 1) {
    return { intent: matched[0], source: "rule", needsVision };
  }
  const intent = await disambiguateWithLLM(m, matched);
  return { intent, source: "llm", needsVision };
}
