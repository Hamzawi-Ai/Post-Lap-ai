import { Router, type IRouter } from "express";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const router: IRouter = Router();

// Default config used as fallback
const DEFAULT_CONFIG = {
  pro_price: "200 د.ل",
  whatsapp: "218915811115",
  agents: {
    libya: "مصراته - وسط البلد مقابل المسرح - مكتب خطفة - واتساب 0915811115",
    jordan: "قريباً",
    saudi: "قريباً",
  },
  accuracy_text: "النتيجة 90% صحيحة بسبب تحديث سياسات Meta & TikTok باستمرار",
};

// Load config.json — edit this file to change prices, agents, accuracy text
function getConfig() {
  // Try multiple candidate paths: next to the built file, next to src, or CWD
  const candidates = [
    join(__dirname, "../config.json"),
    join(__dirname, "../../config.json"),
    join(process.cwd(), "config.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  }
  return DEFAULT_CONFIG;
}

router.get("/config", async (_req, res): Promise<void> => {
  res.json(getConfig());
});

export default router;
