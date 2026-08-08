/**
 * Context Builder — assembles everything Hamzawi needs for one turn:
 * principal, plan/level, brand memory, recent conversation, brand assets
 * (summary-only by default), and runtime config.
 *
 * This centralises the context assembly that previously lived inline in the
 * chat route, so the Reasoner and system-prompt assembly later consume a
 * single, consistent source. Output is intentionally identical to the old
 * inline block — P0 makes no behavioural change.
 */
import {
  db,
  usersTable,
  hamzawiMessagesTable,
  userBrandMemoryTable,
  companiesTable,
  type Plan,
} from "@workspace/db";
import { effectiveLevel } from "../beta/access";
import { eq, desc, and } from "drizzle-orm";
import { collectBrandAssets, type BrandAssets } from "../media/assetReader";
import { isBrandProfileComplete, type BrandMemoryData } from "../brand/brain";
import { getConfig, type AppConfig } from "../../lib/config";
import { getAgentConfig } from "./agentConfig";

export interface ChatContext {
  user: typeof usersTable.$inferSelect | null;
  /** Resolved company row for this user (null when user has no company or for guests). */
  company: typeof companiesTable.$inferSelect | null;
  /** Display name for the authenticated user (empty string for guests). */
  userName: string;
  /** Company name if a company row exists (empty string otherwise). */
  companyName: string;
  sessionId: string;
  plan: Plan;
  level: number;
  memory: BrandMemoryData | null;
  isOnboarding: boolean;
  recentMessages: typeof hamzawiMessagesTable.$inferSelect[];
  brandAssets: BrandAssets | null;
  assetContext: string | undefined;
  config: AppConfig;
}

export async function buildChatContext(params: {
  user: typeof usersTable.$inferSelect | null;
  sessionId: string;
  /** When set, recent message history is scoped to this conversation only. */
  conversationId?: number | null;
}): Promise<ChatContext> {
  const { user, sessionId, conversationId } = params;

  const plan = (user?.plan ?? "visitor") as Plan;
  // Beta-aware capability level (beta users get full access without a plan change).
  const level = effectiveLevel(user);

  const memory = user
    ? await db
        .select()
        .from(userBrandMemoryTable)
        .where(eq(userBrandMemoryTable.user_id, user.id))
        .limit(1)
        .then((r) => r[0] ?? null)
    : null;

  const isOnboarding = level >= 4 && !isBrandProfileComplete(memory);

  // When a conversationId is supplied (authenticated turn with a known thread),
  // scope recent messages to that conversation only. This isolates AI context
  // between sidebar threads. Otherwise fall back to the legacy session/user query.
  const agentConfig = await getAgentConfig();

  const recentMessages = await db
    .select()
    .from(hamzawiMessagesTable)
    .where(
      user && conversationId
        ? and(
            eq(hamzawiMessagesTable.user_id, user.id),
            eq(hamzawiMessagesTable.conversation_id, conversationId)
          )
        : user
          ? eq(hamzawiMessagesTable.user_id, user.id)
          : eq(hamzawiMessagesTable.session_id, sessionId)
    )
    .orderBy(desc(hamzawiMessagesTable.created_at))
    .limit(agentConfig.memory_window);

  // Fetch the company row when the user is linked to one.
  const company = (user?.company_id)
    ? await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.id, user.company_id))
        .limit(1)
        .then((r) => r[0] ?? null)
    : null;

  const userName = user?.name?.trim() ?? "";
  const companyName = company?.name?.trim() ?? "";

  const brandAssets = user
    ? await collectBrandAssets({ userId: user.id, companyId: user.company_id ?? null, memory, cap: agentConfig.asset_cap })
    : null;

  // Build an explicit asset context string that lists each category and count,
  // so the system prompt tells the model exactly what is available.
  let assetContext: string | undefined;
  if (brandAssets && brandAssets.assetItems.length > 0) {
    const { categoryCounts } = brandAssets;
    const lines: string[] = [];
    if (categoryCounts.logo) lines.push(`- الشعار: ${categoryCounts.logo} ملف مرفوع`);
    if (categoryCounts.portfolio) lines.push(`- نماذج التصميم (portfolio): ${categoryCounts.portfolio} ملف`);
    if (categoryCounts.products) lines.push(`- صور المنتجات: ${categoryCounts.products} ملف`);
    if (categoryCounts.generated) lines.push(`- تصاميم مولّدة بالذكاء الاصطناعي: ${categoryCounts.generated} ملف`);
    if (categoryCounts.documents) lines.push(`- مستندات: ${categoryCounts.documents} ملف`);
    if (categoryCounts.design_samples) lines.push(`- أصول مرجعية (من ذاكرة العلامة): ${categoryCounts.design_samples} ملف`);
    assetContext = lines.join("\n");
  }

  return {
    user,
    company,
    userName,
    companyName,
    sessionId,
    plan,
    level,
    memory,
    isOnboarding,
    recentMessages,
    brandAssets,
    assetContext,
    config: getConfig(),
  };
}
