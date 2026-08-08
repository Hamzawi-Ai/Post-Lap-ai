/**
 * PostLab Brain — the product-intelligence orchestration layer.
 *
 * This module composes the AI system prompt from SEPARATE layers:
 *
 *   PERSONA        → who PostLab AI is        (services/ai/postlabPersona.ts, re-exported)
 *   KNOWLEDGE      → what the product does    (services/ai/postlab/knowledge.ts)
 *   RULES          → how it must behave       (services/ai/postlab/rules.ts)
 *   CONTEXT        → authorized customer data (built by services/ai/contextBuilder.ts)
 *
 * Architectural boundaries (do not collapse them):
 *   - PostLab Brain   = stable, GLOBAL product intelligence (this module).
 *   - Company/Brand Memory = customer-specific data, injected here ONLY as
 *     already-authorized context (memory + assets + company name).
 *   - Conversation context = recent messages (fetched by contextBuilder, not here).
 *   - Plan/capability context = per-user level text assembled from authorized data.
 *   - Runtime enforcement (auth, plan gating, ownership, rate limits) = CODE,
 *     never the prompt. This module only tells the model how to behave.
 *
 * This module does NOT touch the database. Data retrieval stays in
 * contextBuilder.ts; the Brain assembles and organises already-authorized
 * context. The `%%GENERATE_POST%%` / `%%NOTES_SAVE%%` / `%%PARTIAL_SAVE%%`
 * marker protocols remain in the chat route (hamzawi.ts), not here.
 *
 * The prompt semantics below were moved from buildSystemPrompt() in the chat
 * route WITHOUT behavioural rewrite — the Arabic instruction text is preserved
 * verbatim. Only the composition order changed: the Brain layer (persona +
 * knowledge + rules) is emitted first, then the customer/plan context blocks.
 */
import { planLevel, type Plan } from "@workspace/db";
import { buildBrandMemoryBlock, type BrandMemoryData } from "../../brand/brain";
import { getConfig } from "../../../lib/config";
import { POSTLAB_PERSONA } from "./persona";
import { renderProductKnowledge } from "./knowledge";
import { renderProductRules } from "./rules";

/**
 * Per-level capability description (plan/capability context).
 * Preserved verbatim from the chat route — this is customer/plan context,
 * not global product knowledge.
 */
const PLAN_CAPABILITIES: Record<number, string> = {
  1: "زائر (المستوى 1/5) — يكشف فقط: اشرح نتائج الفحص، لكن لا تقدم اقتراحات تصحيح مفصّلة. شجّعه على التسجيل",
  2: "مسجّل (المستوى 2/5) — يقترح بدائل: قدّم اقتراحات محددة لتحسين الإعلان لكن لا تولّد صوراً",
  3: "Smart Fix (المستوى 3/5) — يصلح الإعلانات: قدم تصحيحات مفصّلة، أخبره أنه يستطيع طلب توليد صورة بديلة متوافقة عبر الذكاء الاصطناعي",
  4: "Content (المستوى 4/5) — إدارة المحتوى: قدم كامل الدعم بما فيه توليد منشورات من وصف+صورة، وإنشاء نصوص تسويقية",
  5: "Agency (المستوى 5/5) — وكالة: كامل الصلاحيات. يدعم أنشطة تجارية متعددة. يمكنه إدارة هويات بصرية متعددة",
};

/**
 * Upgrade nudge injected naturally at end of PostLab AI response per user level.
 * Level 1 → register, Level 2 → smart_fix, Level 3 → content. Level 4+ no nudge.
 * Preserved verbatim from the chat route.
 */
function getFunnelInstruction(level: number): string {
  if (level === 1) {
    return `
قاعدة القمع التسويقي:
بعد الإجابة على أي طلب مكتمل للمستخدم، أضف جملة واحدة طبيعية في نهاية ردك:
"عشان تشوف ليش مرفوضة بالتفصيل وتحصل على توصيات محددة — سجّل دخولك مجاناً ✨"`;
  }
  if (level === 2) {
    return `
قاعدة القمع التسويقي:
بعد الإجابة على أي طلب مكتمل للمستخدم، أضف جملة واحدة طبيعية في نهاية ردك:
"عشان تصلح الإعلان تلقائياً بالذكاء الاصطناعي — جرّب خطة Smart Fix 🛠️"`;
  }
  if (level === 3) {
    return `
قاعدة القمع التسويقي:
بعد الإجابة على أي طلب مكتمل للمستخدم، أضف جملة واحدة طبيعية في نهاية ردك:
"عشان تصمم منشوراتك بشعار نشاطك وألوانك مباشرة — انتقل لخطة إدارة المحتوى 🎨"`;
  }
  return "";
}

/**
 * Onboarding instructions for level 4+ users who haven't completed brand setup.
 * Uses two markers:
 * - %%PARTIAL_SAVE%%{field:value,...}%%END%% — emitted after each step to save incrementally
 * - %%ONBOARDING_COMPLETE%% — emitted when all required steps are done
 * Preserved verbatim from the chat route.
 */
function getOnboardingInstruction(): string {
  return `
وضع خاص — إعداد هوية النشاط التجاري (ONBOARDING MODE):
المستخدم لم يُكمل إعداد هوية نشاطه بعد. ابدأ الآن جلسة الإعداد الموجّهة خطوة بخطوة.

الخطوات مرتّبة (اسأل واحدة في كل رد وانتظر):
1. اسم النشاط التجاري
2. نوع النشاط (مطعم، متجر، عيادة، شركة خدمات، ...)
3. العنوان أو المنطقة
4. رقم الهاتف للتواصل
5. الألوان الأساسية للهوية البصرية (مثلاً: أزرق وأبيض)
6. الأسلوب المفضل في التصاميم (بسيط، حيوي، فاخر، ...)
7. الشعار والتصاميم السابقة: قل للمستخدم "يمكنك رفع شعار نشاطك باستخدام زر المشبك 📎 — سيُحفظ تلقائياً كشعار. وإذا كان لديك تصاميم إعلانية سابقة أعجبتك، ارفعها واحدة واحدة وستُضاف كنماذج مرجعية نستخدمها في التصميم. هذا الخطوة اختيارية — أخبرني عندما تنتهي أو اكتب 'تخطّ'"
ملاحظة: الرفعة الأولى عبر المشبك تُحفظ كشعار (logo)، وكل رفعة لاحقة تُضاف كنموذج تصميم سابق (design_samples). للتمييز: ارفع الشعار أولاً.

بعد كل خطوة يجيب فيها المستخدم، احفظ المعلومة في نهاية ردك بدون أي نص حولها بهذا الشكل:
%%PARTIAL_SAVE%%{"field_name": "field_value"}%%END%%

أسماء الحقول: business_name, business_type, address, phone, primary_colors, preferred_style

بعد اكتمال كل الخطوات الإلزامية (1-6)، لخّص ما جمعته وقل للمستخدم أن إعداد هوية نشاطه اكتمل، ثم أضف في نهاية ردك:
%%ONBOARDING_COMPLETE%%

إذا قال المستخدم "تخطّ" أو "بعدين"، انتقل للخطوة التالية وأضف:
%%PARTIAL_SAVE%%{"skipped": "true"}%%END%%`;
}

/**
 * Permissions + marketing-notes rules applied once brand setup is done.
 * PostLab AI reads the full profile but may ONLY auto-save the two notes fields.
 * Preserved verbatim from the chat route.
 */
function getPermissionsInstruction(): string {
  return `
صلاحياتك على بيانات النشاط التجاري:
- أنت تقرأ بيانات النشاط بالكامل (أعلاه) وتستخدمها في كل رد وتصميم.
- الحقلان الوحيدان اللذان يمكنك حفظهما تلقائياً هما:
  1. hamzawi_notes — وصف داخلي تكتبه أنت عن العميل أو نشاطك (معلومات مفيدة عن احتياجاته وسلوكه).
  2. marketing_notes — ملاحظات تسويقية دائمة طلبها العميل نفسه (مثل: "أفضل استخدام اللهجة الليبية" أو "لا أحب التصاميم المزدحمة").
- لحفظ أحدهما ضع في نهاية ردك: %%NOTES_SAVE%%{"hamzawi_notes": "..."} أو %%NOTES_SAVE%%{"marketing_notes": "..."} بدون أي نص حولها.
- لا تحفظ ولا تعدّل أبداً بيانات النشاط الأساسية (اسم النشاط، نوع النشاط، العنوان، الهاتف، الألوان، الأسلوب، النبذة، الشعار) — تعديلها يتم فقط من صفحة "هوية النشاط التجاري". إذا طلب المستخدم تعديلها، وجّهه إلى صفحة إعدادات النشاط.
- عند إبداء المستخدم تفضيلاً دائماً مفيداً للتسويق (مثل اللهجة المفضلة، أو عدم حبّه لأسلوب معين)، اقترح بلطف: "هل تريد أن أحفظ هذه الملاحظة لاستخدامها في المستقبل؟" واحفظها عبر %%NOTES_SAVE%% فقط بعد موافقته الصريحة. لا تحوّل كل رسالة إلى ذاكرة، ولا تحفظ إلا المعلومات القيّمة على المدى الطويل.
- إذا احتاج المستخدم رفع شعار أو تصاميم مرجعية لتحسين التصميم، اطلب منه رفعها من زر المشبك 📎 في المحادثة وستُضاف تلقائياً إلى ملف نشاطه.
- ابقَ متخصصاً في التسويق والإعلان وكتابة المحتوى وتصميم المنشورات والهوية البصرية فقط — لا تتوسع إلى مجالات أخرى.`;
}

/**
 * Design generation behaviour (Content plan and above, level 4+).
 * PostLab AI generates the requested design directly through the shared image
 * pipeline by emitting a GENERATE_POST marker; the server renders the image
 * and returns it in the chat. Lower plans get a normal capability reply only.
 * Preserved verbatim from the chat route.
 */
function getDesignGenerationInstruction(level: number): string {
  if (level < 4) return "";
  return `
توليد التصاميم (متاح من خطتك):
- عندما يطلب المستخدم تصميماً (منشور، بوست، ستوري، بانر، فلاير، بوستر، صورة إعلان، صورة ترويجية...) — قم بتوليده مباشرة.
- لا تقترح أبداً Canva أو Photoshop أو أي أدوات تصميم يدوية أو خارجية، إلا إذا طلب المستخدم صراحةً نصيحة للتصميم اليدوي.
- استخرج من الطلب والمعلومات المحفوظة: اسم النشاط، مجاله، العرض/المنتج المعروض، الألوان، والأسلوب المفضل. اكتب وصف التصميم بالإنجليزية، موجزاً ودقيقاً (يتضمن اسم النشاط، النص الأساسي للمنشور إن ذُكر، ألوان الهوية، الحجم إن ذُكر مثل 1080x1350، والأسلوب).
- إذا كانت تفاصيل العرض ناقصة بشكل جوهري (ما الذي سيعرضه؟) اسأل سؤالاً واحداً قصيراً قبل التوليد — وإلا ولّد مباشرة دون إطالة.

قاعدة صارمة وغير قابلة للاستثناء — توليد الصورة:
عندما يكون نية المستخدم توليد تصميم أو صورة، يجب أن يحتوي ردك دائماً على الماركر التالي بدون استثناء:
%%GENERATE_POST%%{"description": "وصف التصميم بالإنجليزية هنا"}%%END%%
لا تردّ بنص وحده. لا تؤكد. لا تسأل. لا تصف ما ستفعله. فقط أضف الماركر مع وصف كامل للتصميم.
إذا كان الوصف ناقصاً، خمّن القيم المناسبة من بيانات النشاط المحفوظة وولّد مباشرة.`;
}

/**
 * Compose the full system prompt for one turn.
 *
 * Signature preserved from the former buildSystemPrompt() in the chat route so
 * the route call site is unchanged. All parameters are ALREADY-authorized
 * context produced by contextBuilder.ts / the route — no DB access here.
 *
 * Order:
 *   1. PostLab Brain — persona + product knowledge + product rules (global)
 *   2. Identity header (current user/company)
 *   3. Plan/capability context (per-user level)
 *   4. Company/Brand Memory block + asset inventory (authorized customer context)
 *   5. Runtime/context-specific instructions (pricing line, funnel, onboarding,
 *      design generation, permissions)
 */
export function composeSystemPrompt(
  plan: Plan | string,
  memory: BrandMemoryData | null,
  isOnboarding: boolean,
  assetContext?: string,
  userName?: string,
  companyName?: string,
): string {
  const level = planLevel(plan);

  const brainBlock = `${POSTLAB_PERSONA}

${renderProductKnowledge()}

${renderProductRules()}`;

  // Identity header — greet by name when known.
  const identityLines: string[] = [];
  if (userName) identityLines.push(`- المستخدم الحالي: ${userName}`);
  if (companyName) identityLines.push(`- الشركة/المنشأة: ${companyName}`);
  const identityBlock = identityLines.length > 0
    ? `\nهوية المستخدم:\n${identityLines.join("\n")}\n`
    : "";

  const memoryBlock = buildBrandMemoryBlock(memory);

  // Explicit asset listing — names each category and count so the model knows exactly what exists.
  const assetsBlock = assetContext
    ? `\nالأصول المحفوظة لهذا المستخدم (مُرفقة كصور عند الحاجة — استخدمها تلقائياً):\n${assetContext}\n`
    : "";

  const assetUsageInstruction = assetContext
    ? `- كلما كان طلب المستخدم قابلاً للاستفادة من أحد الأصول المذكورة أعلاه (الشعار، صور المنتجات، نماذج التصميم...)، أشر صراحةً إلى أنك ستستخدمه وحدد أيّها بالاسم — مثال: "سأستخدم الشعار الذي رفعته" أو "I'll use the logo you uploaded".`
    : "";

  const funnelInstruction = isOnboarding ? "" : getFunnelInstruction(level);
  const onboardingInstruction = isOnboarding ? getOnboardingInstruction() : "";
  const designGenInstruction = getDesignGenerationInstruction(level);

  const permissionsInstruction =
    (!isOnboarding && level >= 2 && memory?.brand_onboarded)
      ? getPermissionsInstruction()
      : "";

  // Pricing line derived from config.json — single source of truth (runtime config).
  const cfg = getConfig();
  const pricingLine = cfg.pricing.plans
    .map((p) => `${p.name} (${p.price} ${cfg.pricing.currency}/شهر)`)
    .join("، ");

  return `${brainBlock}
${identityBlock}
مستوى خطة المستخدم: ${PLAN_CAPABILITIES[level] ?? PLAN_CAPABILITIES[1]}

${memoryBlock}${assetsBlock}

تعليمات:
- خطط الترقية المتاحة: مسجّل (مجاني)، ${pricingLine}
${assetUsageInstruction}
${funnelInstruction}
${onboardingInstruction}
${designGenInstruction}
${permissionsInstruction}`;
}
