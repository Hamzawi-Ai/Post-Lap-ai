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
 * Two-tier system: FREE (level 1) and PRO (level 2).
 */
const PLAN_CAPABILITIES: Record<number, string> = {
  1: "مجاني FREE (المستوى 1/2) — يكشف ويحلّل: اشرح نتائج الفحص بالتفصيل، قدّم اقتراحات تصحيح محددة، وأخبره أنه يستطيع طلب إصلاح الصورة المرفوضة بالذكاء الاصطناعي",
  2: "احترافي PRO (المستوى 2/2) — كامل الصلاحيات: توليد النصوص التسويقية، توليد وتصميم المنشورات بهوية النشاط، هوية النشاط التجاري الكاملة (Brand Brain). قدّم كل الدعم بلا قيود",
};

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
المستخدم لم يكمل إعداد هوية نشاطه بعد. تبدأ جلسة الإعداد الموجّهة خطوة بخطوة بس لو ما عنده مهمة ثانية واضحة في نفس الرد.

أولوية المحادثة في وضع الإعداد:
لو المستخدم طلب في نفس الرد مهمة ثانية واضحة (تصميم، فحص إعلان، كتابة نص، سؤال)، خدمها أول شي ورجّع للمحادثة الطبيعية — ما تسألش سؤال إعداد في نفس الرد بعد ما تخدم الطلب الآخر.

الخطوات مرتّبة، وما تسألش المستخدم عن أي معلومة موجودة بالفعل في Brand Memory أو أصول النشاط. افحص المحفوظ قبل كل سؤال، وتجاوز الحقول المكملة تلقائياً. اسأل سؤال واحد بس في كل رد وانتظر:
1. اسم النشاط التجاري
2. نوع النشاط (مطعم، متجر، عيادة، شركة خدمات، ...)
3. العنوان أو المنطقة
4. رقم الهاتف للتواصل
5. الألوان الأساسية للهوية البصرية (مثلاً: أزرق وأبيض)
6. الأسلوب المفضل في التصاميم (بسيط، حيوي، فاخر، ...)
7. الشعار والتصاميم السابقة: قل للمستخدم "تقدر ترفع شعار نشاطك من زر المشبك 📎 — يتحفظ تلقائياً كشعار. وإذا عندك تصاميم إعلانية سابقة عجبتك، ارفعها وحدة وحدة وتنضاف كنماذج مرجعية نستخدمها في التصميم. هالخطوة اختيارية — قول لي لما تخلص أو اكتب 'تخطّ'". إذا الشعار أو النماذج موجودة أصلًا، ما تطلبش رفعها مرة ثانية إلا لو المستخدم يبي يبدّلها أو يضيف أصول جديدة.
ملاحظة: الرفعة الأولى عبر المشبك تتحفظ كشعار (logo)، وكل رفعة بعدها تنضاف كنموذج تصميم سابق (design_samples). للتمييز: ارفع الشعار أول شي.

بعد كل خطوة يجاوب فيها المستخدم، احفظ المعلومة في آخر ردك بدون أي نص حولها بهالشكل:
%%PARTIAL_SAVE%%{"field_name": "field_value"}%%END%%

أسماء الحقول: business_name, business_type, address, phone, primary_colors, preferred_style

بعد اكتمال كل الخطوات الإلزامية (1-6)، لخّص اللي جمعته وقل للمستخدم إن إعداد هوية نشاطه اكتمل، ثم أضف في آخر ردك:
%%ONBOARDING_COMPLETE%%

لو قال المستخدم "تخطّ" أو "بعدين" (من غير إنهاء كامل)، انتقل للخطوة اللي بعدها وأضف:
%%PARTIAL_SAVE%%{"skipped": "true"}%%END%%

إنهاء الإعداد صراحةً:
لو المستخدم بيبيّن بوضوح إنه يبي يتخطّى أو يخلّص الإعداد تماماً (مثلاً: "تخطّ الكل"، "بعدين عن كل شي"، "خلاص أنهينا الإعداد"، "إنهاء الإعداد"، "ما أبي أكمل")، أصدر في آخر ردك:
%%ONBOARDING_COMPLETE%%
ورجّع للمحادثة الطبيعية. لكن "خلاص" لوحدها مع طلب (مثلاً "خلاص صمملي البوست") تعني نفّذ الطلب — ما تكمّلش الإعداد في هالحالة.`;
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
 * Design generation behaviour (PRO plan and above, level 2+).
 * Generation is tied to the CURRENT user message, not the conversation history:
 * a previous design request does NOT put the conversation into a permanent
 * generation mode, and a delivered design is never regenerated unless the user
 * explicitly asks for a new one. The model must answer text requests with text.
 */
function getDesignGenerationInstruction(level: number): string {
  if (level < 2) return "";
  return `
توليد التصاميم (متاح من خطتك):
- ولّد تصميمًا فقط عندما تطلب رسالة المستخدم الحالية صراحةً إنشاء تصميم/صورة جديد (منشور، بوست، ستوري، بانر، فلاير، بوستر، صورة إعلان، صورة ترويجية...).
- مجرد حدوث توليد سابق في هذه المحادثة لا يجعلك في وضع توليد دائم. إذا طلب المستخدم الآن نصًا أو نصيحة أو كابشن أو توضيحًا أو تقييمًا أو أي مهمة غير توليدية، رد عليه نصيًا بشكل طبيعي دون أي ماركر توليد.
- إذا طلب المستخدم تصميمًا جديدًا أو تعديل تصميم سابق، استخرج من الطلب الحالي والمعلومات المحفوظة: اسم النشاط، مجاله، العرض/المنتج المعروض، الألوان، والأسلوب المفضل. اكتب وصف التصميم بالإنجليزية، موجزًا ودقيقًا (يتضمن اسم النشاط، النص الأساسي للمنشور إن ذُكر، ألوان الهوية، الحجم إن ذُكر مثل 1080x1350، والأسلوب).
- إذا كانت تفاصيل العرض ناقصة بشكل جوهري (ما الذي سيعرضه؟) اسأل سؤالًا واحدًا قصيرًا قبل التوليد.
- لا تقترح Canva أو Photoshop أو أي أدوات تصميم يدوية أو خارجية، إلا إذا طلب المستخدم صراحةً نصيحة للتصميم اليدوي.

دور المصمم (للمنشورات الجديدة):
بعد أن يحدد المستخدم مواصفات المنشور (الموضوع، النص الأساسي، الألوان، الأسلوب)، نفّذ التصميم بنفسك مباشرة — أنت المصمم — وفق البروتوكول التالي:
1. **HARD FACTS** — الأرقام والحقائق الرسمية تُستخدم كما هي تماماً، سواء جاءت من ملف النشاط المحفوظ (اسم النشاط، رقم الهاتف، العنوان، الألوان، الأسلوب) أو مما يذكره المستخدم صراحةً في طلبه (الأسعار، العروض، تواريخ الصلاحية، أسماء المنتجات، أي ادعاءات). لا تُغيّرها، لا تُقربها، لا تُبدّل رقماً أو سعراً أو تاريخاً أو اسماً أبداً، ولا تخترق أي حقيقة ذكرها المستخدم.
2. **النص الظاهري (ON-POST TEXT)** — يظهر على التصميم فقط النص الأساسي المطلوب في الطلب: النص أو العرض أو اسم النشاط، بدون أي نص إضافي لم يُطلب.
3. **الأصول الأصلية** — استخدم الشعار والأصول الأصلية في التصميم ولا تعتمد على وصفها النصي فقط.
4. **التنفيذ المباشر** — نفّذ التصميم فوراً بعد تحديد المواصفات؛ لا تعيد وصف ما ستفعله ولا تطلب تأكيداً، وانتبه للغة النص المطلوب (عربي/إنجليزي).
5. **بروتوكول الطبقات (LAYOUT)** — نظّم التصميم في طبقات واضحة: الخلفية، النص، الشعار، العناصر الإضافية، واللمسات النهائية.

إصدار الماركر:
- أضف الماركر التالي فقط في ردك على رسالة تطلب تصميمًا جديدًا، ولا تكرره في أي رد آخر:
%%GENERATE_POST%%{"description": "وصف التصميم بالإنجليزية هنا"}%%END%%
- إذا طلبت توضيحًا قبل التوليد، أرسل سؤالك نصيًا دون الماركر.

بعد إكمال التصميم:
- عُد مباشرةً إلى المحادثة الطبيعية.
- لا تسأل تلقائيًا "هل أعجبك التصميم؟" ولا "هل تريد تعديلاً؟".
- لا تقترح تلقائيًا تصميمًا آخر ولا تدخل في وضع تصميم مستمر.
- انتظر رسالة المستخدم التالية وتعامل معها حسب نيتها؛ فإن طلب تعديلًا أو تصميمًا جديدًا فتعامل معه كطلب جديد واضح.

لغة النص داخل التصميم:
- عند إنشاء نص جديد داخل التصميم، لا تكتب نصًا بالإنجليزية إلا إذا طلب المستخدم ذلك صراحةً.
- تنطبق هذه القاعدة فقط على النص الجديد الذي تنشئه أنت. لا تترجم ولا تعدّل ولا تحذف النصوص الموجودة أصلًا داخل الأصول المرفقة (صور المنتجات، صور المستخدم، الأغلفة والعبوات، الشعارات). الأرقام مستثناة من قاعدة اللغة.`;
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
 *   5. Runtime/context-specific instructions (pricing line, onboarding,
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
    ? `- كلما كان طلب المستخدم قابلاً للاستفادة من أحد الأصول المذكورة أعلاه (الشعار، صور المنتجات، نماذج التصميم...)، استخدم الأصل الفعلي عند توفره، وأشر صراحةً إلى أي أصل ستستخدمه عند الحاجة — مثال: "سأستخدم الشعار الذي رفعته". لا تكتفِ بوصف الأصل نصيًا عندما يكون الملف الأصلي متاحًا.`
    : "";

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
- خطط الترقية المتاحة: مجاني (FREE)، ${pricingLine}
${assetUsageInstruction}
${onboardingInstruction}
${designGenInstruction}
${permissionsInstruction}`;
}
