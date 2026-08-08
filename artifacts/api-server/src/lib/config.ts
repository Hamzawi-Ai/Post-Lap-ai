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
    agencyExtraProjectPrice: number;
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
        id: "smart_fix",
        name: "Smart Fix",
        nameAr: "الإصلاح الذكي",
        price: 100,
        desc: "للمعلنين الأفراد",
        features: [
          "تصحيح الإعلانات المرفوضة",
          "فحوصات غير محدودة",
          "فيديو حتى 60 ثانية",
          "دعم أولوية",
        ],
        badge: null,
        cta: "اشترك في Smart Fix",
        highlight: false,
      },
      {
        id: "content",
        name: "إدارة المحتوى",
        nameAr: "للشركات والمتاجر",
        price: 400,
        desc: "للشركات والمتاجر",
        features: [
          "كل مميزات Smart Fix",
          "لوحة إدارة المحتوى",
          "توليد نصوص بالليبي الأصيل",
          "تصميم منشورات مع الشعار",
        ],
        badge: "الأكثر طلباً",
        cta: "اشترك في إدارة المحتوى",
        highlight: true,
      },
      {
        id: "agency",
        name: "خطة الوكالة",
        nameAr: "للمكاتب الإعلانية",
        price: 1000,
        desc: "+ 400 د.ل لكل مشروع إضافي",
        features: [
          "كل مميزات إدارة المحتوى",
          "مشاريع متعددة",
          "بيانات وهوية مستقلة لكل مشروع",
          "مدير حساب مخصص",
        ],
        badge: null,
        cta: "اشترك في خطة الوكالة",
        highlight: false,
      },
    ],
    agencyExtraProjectPrice: 400,
  },
  whatsapp: "218915811115",
  agents: {
    libya: "مصراته - وسط البلد مقابل المسرح - مكتب خطفة - واتساب 0915811115",
    jordan: "قريباً",
    saudi: "قريباً",
  },
  accuracy_text: "النتيجة 90% صحيحة بسبب تحديث سياسات Meta & TikTok باستمرار",
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
