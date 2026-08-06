/**
 * Beta tool registration (metadata only).
 *
 * Each tool describes itself to the Reasoner. Execution is intentionally NOT
 * wired in the beta — the existing endpoints (/api/check, /api/generate-text,
 * /api/image-gen, /api/hamzawi/memory, /api/hamzawi/upload-asset) remain the
 * compatibility layer until the orchestrator fully takes over their flows.
 *
 * TODO(prompt-studio): consume AgentConfig — tool_policies
 * After the Studio integration pass, merge AgentConfig.tool_policies into each
 * registration so requiredLevel and enabled() come from the DB row rather than
 * being hardcoded here.
 */
import { toolRegistry } from "./registry";
import { isImageGenAvailable } from "../../image-gen/provider";

toolRegistry.register({
  id: "check_ad",
  description: "فحص صورة أو فيديو إعلان للتأكد من توافقه مع سياسات Meta",
  requiredLevel: 1,
  requireAuth: "none",
  enabled: () => true,
});

toolRegistry.register({
  id: "generate_text",
  description: "توليد نص إعلاني باللهجة الليبية لمنتج أو خدمة",
  requiredLevel: 3,
  requireAuth: "jwt",
  enabled: () => true,
});

toolRegistry.register({
  id: "generate_image",
  description: "توليد منشور مصمم بهوية النشاط أو إصلاح صورة إعلان مرفوضة",
  requiredLevel: 4,
  requireAuth: "jwt",
  enabled: () => isImageGenAvailable(),
});

toolRegistry.register({
  id: "save_brand_memory",
  description: "حفظ معلومات هوية النشاط التجاري",
  requiredLevel: 2,
  requireAuth: "jwt",
  enabled: () => true,
});

toolRegistry.register({
  id: "read_brand_memory",
  description: "قراءة معلومات هوية النشاط التجاري المحفوظة",
  requiredLevel: 2,
  requireAuth: "jwt",
  enabled: () => true,
});

toolRegistry.register({
  id: "upload_asset",
  description: "رفع صورة كمرفق أو أصل وسائط في مكتبة الوسائط",
  requiredLevel: 2,
  requireAuth: "jwt",
  enabled: () => true,
});

export { toolRegistry } from "./registry";
export type {
  HamzawiTool,
  ToolContext,
  ToolResult,
  ToolAuthRequirement,
  ToolInputValidator,
} from "./types";
