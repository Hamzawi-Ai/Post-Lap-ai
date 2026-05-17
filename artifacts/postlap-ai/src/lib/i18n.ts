export type AppLang = "ar" | "en";

export const ui = {
  ar: {
    dir: "rtl" as const,
    nav: {
      check: "الفحص",
      generateText: "توليد النص",
      agents: "الوكلاء",
      signIn: "سجّل الدخول",
      signOut: "خروج",
    },
    hero: {
      badge: "مدعوم بالذكاء الاصطناعي",
      headline1: "اكتشف المخالفات",
      headline2: "قبل النشر",
      sub: "مبني للمسوّقين والوكالات والشركات التي تريد إعلانات أذكى وأأمن",
    },
    upload: {
      cta: "ارفع هنا للفحص",
      desc: "صورة PNG / JPG أو فيديو MP4 — حتى 50 ميجابايت",
      btn: "حلّل إعلاني الآن",
      analyzing: "جاري تحليل الإعلان...",
      oneMore: "لحظة أخيرة...",
    },
    plans: {
      sectionTitle: "اختر خطتك",
      paidUsers: "مشتركون",
    },
    generate: {
      title: "ولّد نص إعلانك",
      titleGuest: "تبي تعرف أكثر عن سبب الرفض؟ سجل الدخول مجاناً",
    },
    results: {
      excellent: "ممتاز انطلق",
      good: "جيد لكن وصوله ضعيف",
      rejected: "سوف يتم رفضه",
      score: "النقاط",
      violations: "المخالفات",
      suggestions: "الاقتراحات",
      copyResult: "نسخ",
      copied: "تم النسخ",
    },
    trialBlock: {
      title: "انتهت المحاولات المجانية",
      desc: "استنفذت جميع محاولاتك المجانية. سجّل للحصول على المزيد أو اشترك في خطة مدفوعة.",
      register: "سجّل مجاناً",
      plans: "عرض الخطط",
    },
    footer: {
      rights: "جميع الحقوق محفوظة",
    },
  },
  en: {
    dir: "ltr" as const,
    nav: {
      check: "Check",
      generateText: "Generate Text",
      agents: "Agents",
      signIn: "Sign In",
      signOut: "Sign Out",
    },
    hero: {
      badge: "AI-Powered",
      headline1: "Catch Policy Violations",
      headline2: "Before Publishing",
      sub: "Built for marketers, agencies, and businesses who want smarter, safer ads",
    },
    upload: {
      cta: "Drop here to analyze",
      desc: "PNG / JPG image or MP4 video — up to 50 MB",
      btn: "Analyze My Ad Now",
      analyzing: "Analyzing your ad...",
      oneMore: "Almost done...",
    },
    plans: {
      sectionTitle: "Choose Your Plan",
      paidUsers: "Subscribers",
    },
    generate: {
      title: "Generate Your Ad Copy",
      titleGuest: "Want to know more about the rejection? Sign in for free",
    },
    results: {
      excellent: "Excellent — go ahead",
      good: "Good but low reach",
      rejected: "Will be rejected",
      score: "Score",
      violations: "Violations",
      suggestions: "Suggestions",
      copyResult: "Copy",
      copied: "Copied",
    },
    trialBlock: {
      title: "Free trials used up",
      desc: "You've used all your free trials. Register for more or subscribe to a paid plan.",
      register: "Register for free",
      plans: "View plans",
    },
    footer: {
      rights: "All rights reserved",
    },
  },
} satisfies Record<AppLang, object>;
