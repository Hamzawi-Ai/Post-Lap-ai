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
  planLevel,
  type Plan,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { collectBrandAssets, type BrandAssets } from "../media/assetReader";
import { isBrandProfileComplete, type BrandMemoryData } from "../brand/brain";
import { getConfig, type AppConfig } from "../../lib/config";

export interface ChatContext {
  user: typeof usersTable.$inferSelect | null;
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
}): Promise<ChatContext> {
  const { user, sessionId } = params;

  const plan = (user?.plan ?? "visitor") as Plan;
  const level = planLevel(plan);

  const memory = user
    ? await db
        .select()
        .from(userBrandMemoryTable)
        .where(eq(userBrandMemoryTable.user_id, user.id))
        .limit(1)
        .then((r) => r[0] ?? null)
    : null;

  const isOnboarding = level >= 4 && !isBrandProfileComplete(memory);

  const recentMessages = await db
    .select()
    .from(hamzawiMessagesTable)
    .where(
      user
        ? eq(hamzawiMessagesTable.user_id, user.id)
        : eq(hamzawiMessagesTable.session_id, sessionId)
    )
    .orderBy(desc(hamzawiMessagesTable.created_at))
    .limit(10);

  const brandAssets = user
    ? await collectBrandAssets({ userId: user.id, companyId: user.company_id ?? null, memory })
    : null;
  const assetContext = brandAssets && brandAssets.images.length > 0 ? brandAssets.summary : undefined;

  return {
    user,
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
