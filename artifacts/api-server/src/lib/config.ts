import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Single source of truth for app configuration (pricing, whatsapp, agents,
 * accuracy text). The on-disk config.json is loaded at request time so edits
 * take effect without a restart. Falls back to DEFAULT_CONFIG when the file
 * is missing. Consumers must never hardcode prices — read them from here.
 */
export interface PricingPlan {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  desc: string;
  features: string[];
  badge: string | null;
  cta: string;
  highlight: boolean;
}

export interface AppConfig {
  pricing: {
    currency: string;
    plans: PricingPlan[];
  };
  whatsapp: string;
  agents: Record<string, string>;
  accuracy_text: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  pricing: {
    currency: "د.ل",
    plans: [
      {
        id: "free",
        name: "مجاني (FREE)",
        nameAr: "للأفراد والتجربة",
        price: 0,
        desc: "للأفراد والتجربة",
        features: [
          "فحص الإعلانات وتحليل المحتوى",
          "عرض المخالفات والتوصيات",
          "إصلاح الصور المرفوضة بالذكاء الاصطناعي",
          "فحص الإعلانات مجاناً"
        ],
        badge: "",
        cta: "ابدأ مجاناً",
        highlight: false,
      },
      {
        id: "pro",
        name: "احترافي (PRO)",
        nameAr: "للشركات والمتاجر",
        price: 400,
        desc: "للشركات والمتاجر",
        features: [
          "كل مميزات المجاني",
          "توليد نصوص إعلانية بالليبي الأصيل",
          "توليد صور المنشورات بالذكاء الاصطناعي",
          "تصميم منشورات بشعار نشاطك وألوانه",
          "ذاكرة دائمة — PostLab يتذكر نشاطك",
        ],
        badge: "الأكثر طلباً",
        cta: "اشترك في PRO",
        highlight: true,
      },
    ],
  },
  whatsapp: "218915811115",
  agents: {
    libya: "مصراته - وسط البلد مقابل المسرح - مكتب خطفة - واتساب 0915811115",
    jordan: "قريباً",
    saudi: "قريباً",
  },
  accuracy_text: "الفحص يستند إلى سياسات Meta الإعلانية ويُحدَّث وفق تغيّراتها.",
};

export function getConfig(): AppConfig {
  // Try multiple candidate paths: next to the built file, next to src, or CWD
  const candidates = [
    join(__dirname, "../config.json"),
    join(__dirname, "../../config.json"),
    join(process.cwd(), "config.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8")) as AppConfig;
      } catch (err) {
        logger.warn({ path: p, err }, "Failed to parse config.json — falling back to DEFAULT_CONFIG");
      }
    }
  }
  return DEFAULT_CONFIG;
}
