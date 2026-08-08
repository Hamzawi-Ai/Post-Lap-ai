import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
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
  } catch (err) {
    // JWT errors (invalid/expired token) → unauthenticated, not an error.
    // Anything else (DB outage, network error) → rethrow so the global error
    // handler returns a 503 rather than silently granting guest access.
    if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
      return null;
    }
    throw err;
  }
}

export function requireUser(req: { headers: { authorization?: string } }): Promise<typeof usersTable.$inferSelect | null> {
  return getUserFromToken(req.headers.authorization);
}

/**
 * Verify that the presented Bearer token is a valid admin (owner) JWT —
 * the same credential `/api/admin/login` issues and `requireAdmin` enforces.
 * Non-blocking boolean form so routes can detect the supervisory context
 * without rejecting the request. Never trusts client-supplied claims: only a
 * SESSION_SECRET-signed token carrying `role: "admin"` passes.
 */
export function isAdminToken(authHeader?: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, SESSION_SECRET) as { role?: string };
    return decoded.role === "admin";
  } catch {
    return false;
  }
}