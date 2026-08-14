/**
 * PostLab Product Knowledge — the structured, maintainable source of truth for
 * what the PostLab product actually is and actually does.
 *
 * This layer is SEPARATE from the persona (who PostLab AI is) and from product
 * rules (how it must behave). It documents capabilities that demonstrably
 * exist in this codebase, each tagged with a runtime status:
 *
 *   A — Implemented and operational (verified in code)
 *   B — Architecturally present, runtime availability NOT confirmed
 *       (provider/environment-dependent — must not be promised)
 *   C — Planned / future capability (documented intent, not built)
 *   D — Not implemented
 *
 * Capabilities are derived from the existing endpoints/services only. Do NOT
 * invent publishing, scheduling, analytics, integrations, tools, or workflows
 * that are not demonstrably implemented.
 *
 * When the product changes, edit THIS file — never the persona and never the
 * system prompt directly. renderProductKnowledge() renders the prompt block.
 */

export type CapabilityStatus = "A" | "B" | "C" | "D";

export interface ProductCapability {
  id: string;
  /** Capability name (Arabic, product-facing). */
  name: string;
  status: CapabilityStatus;
  /** Where it lives in the code (endpoint / service / marker). */
  implementedIn: string;
  /** Short, factual description of what it does today. */
  description: string;
  /** Runtime requirements / gating notes — factual, no guarantees. */
  runtimeNotes?: string;
}

export const PRODUCT_KNOWLEDGE: {
  product: { name: string; mission: string };
  capabilities: ProductCapability[];
} = {
  product: {
    name: "PostLab AI",
    mission:
      "مساعدة الأنشطة التجارية العربية على تسويق أعمالها بذكاء عبر إنشاء وتحسين المحتوى والإعلانات والتصاميم، مع فهم هوية النشاط التجاري والحفاظ عليها، ومساعدتها على إنتاج محتوى أكثر ملاءمة وفعالية ومتوافقًا مع سياسات المنصات.",
  },
  capabilities: [
    {
      id: "policy_intelligence",
      name: "Policy Intelligence (فحص الإعلانات)",
      status: "A",
      implementedIn: "POST /api/check (routes/ads.ts)",
      description:
        "فحص إعلان (صورة/فيديو) للتحقق من توافقه مع سياسات Meta وإرجاع تقرير منظم بالمخالفات والاقتراحات.",
      runtimeNotes: "التحليل الحقيقي يتطلب OPENAI_API_KEY.",
    },
    {
      id: "brand_intelligence",
      name: "Brand Intelligence (هوية النشاط)",
      status: "A",
      implementedIn: "userBrandMemoryTable + GET/PUT /api/hamzawi/memory (services/brand)",
      description:
        "حفظ هوية النشاط التجاري (الاسم، النوع، العنوان، الهاتف، الألوان، الأسلوب، الشعار، النماذج) واستخدامها تلقائياً في المحادثة والتصميم.",
    },
    {
      id: "asset_library",
      name: "Asset Library (مكتبة الوسائط)",
      status: "A",
      implementedIn: "POST /api/hamzawi/upload-asset + mediaAssetsTable (services/media)",
      description:
        "رفع وتخزين الأصول (شعار، نماذج تصميم، صور منتجات) وإتاحتها للنموذج في سياق المحادثة.",
    },
    {
      id: "creative_text",
      name: "Creative Intelligence — توليد النصوص الإعلانية",
      status: "A",
      implementedIn: "POST /api/generate-text (gpt-4o-mini)",
      description:
        "تطوير النصوص التسويقية والإعلانية المناسبة لهوية النشاط وجمهوره وهدفه باللهجة الليبية(عربية/شرقية/جذابة)، مع الحفاظ على أسلوب العلامة التجارية وتقديم نصوص واضحة وجذابة وقابلة للاستخدام على المنصات المختلفة.",
      runtimeNotes: "متاح لمشتركي خطة PRO (المستوى 2)، يتطلب OPENAI_API_KEY.",
    },
    {
      id: "creative_image",
      name: "Creative Intelligence — توليد التصاميم",
      status: "B",
      implementedIn: "%%GENERATE_POST%% marker → generateBrandedPost (services/image-gen, Gemini)",
      description:
        "تطوير وتوليد التصاميم والمنشورات الإعلانية بما يخدم الهدف التسويقي ويعكس هوية النشاط التجاري، باستخدام أصول العلامة التجارية والمعلومات المحفوظة عند توفرها..",
      runtimeNotes:
        "متاح لمشتركي خطة PRO (المستوى 2). خط أنابيب التوليد موجود في الكود، لكن توفر المزوّد وقت التشغيل غير مؤكد (يُعالج في Task #43). لا تَعِد بتوليد الصور إذا كان غير متاح فعلياً.",
    },
    {
      id: "conversation_memory",
      name: "ذاكرة المحادثة",
      status: "A",
      implementedIn: "hamzawi_messages + hamzawi_conversations (services/ai/contextBuilder.ts)",
      description:
        "سجل المحادثة الحالية والسابقة، محدّد النطاق لكل مستخدم/جلسة/محادثة.",
    },
    {
      id: "video_analysis",
      name: "تحليل الفيديو",
      status: "D",
      implementedIn: "—",
      description: "غير متاح: يتطلب ffmpeg غير مثبت على الخادم.",
    },
    {
      id: "vector_search",
      name: "البحث المتجه عبر المحتوى التاريخي",
      status: "C",
      implementedIn: "— (retrieval_config في AgentConfig، بلا محرك)",
      description: "استرجاع متجه — مستقبلي وغير مبني بعد.",
    },
    {
      id: "publishing_scheduling_analytics",
      name: "النشر / الجدولة / التحليلات",
      status: "D",
      implementedIn: "—",
      description: "غير منفّذة — لا تَدَّعِ هذه القدرات.",
    },
  ],
};

/** Render the product-knowledge prompt block (Arabic, product-facing). */
export function renderProductKnowledge(): string {
  const lines: string[] = [
    "معرفة المنتج (PostLab):",
    `- المهمة: ${PRODUCT_KNOWLEDGE.product.mission}`,
  ];

  for (const cap of PRODUCT_KNOWLEDGE.capabilities) {
    if (cap.status === "A") {
      lines.push(`- ${cap.name}: ${cap.description}`);
    } else if (cap.status === "B") {
      lines.push(
        `- ${cap.name}: ${cap.description} (متاح معمولياً لكن توفر المزوّد وقت التشغيل غير مؤكد — لا تَعِد بالتنفيذ قبل تأكده فعلياً).`,
      );
    }
  }

  const notImplemented = PRODUCT_KNOWLEDGE.capabilities.filter(
    (c) => c.status === "C" || c.status === "D",
  );
  if (notImplemented.length > 0) {
    lines.push(
      `قدرات غير متاحة حالياً (لا تدَّعِ أنها تعمل): ${notImplemented.map((c) => c.name).join("، ")}.`,
    );
  }

  return lines.join("\n");
}
