import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_SECRET } from "../lib/secrets";

export async function getUserFromToken(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, SESSION_SECRET) as { userId?: number };
    if (!decoded.userId) return null;
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);
    if (!user) return null;
    // A deactivated account must not retain session access — treat its token
    // as invalid so every token-protected endpoint refuses it.
    if (!user.is_active) return null;
    return user;
  } catch {
    return null;
  }
}

export function requireUser(req: { headers: { authorization?: string } }): Promise<typeof usersTable.$inferSelect | null> {
  return getUserFromToken(req.headers.authorization);
}