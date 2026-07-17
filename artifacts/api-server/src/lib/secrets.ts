import { logger } from "./logger";

const isProduction = process.env.NODE_ENV === "production";

function resolveSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (!isProduction) return devFallback;
  logger.error(
    { secret: name },
    "Required environment variable is missing in production",
  );
  throw new Error(
    `Missing required environment variable: ${name} (must be set when NODE_ENV=production)`,
  );
}

export const SESSION_SECRET = resolveSecret("SESSION_SECRET", "dev-secret");
export const ADMIN_PASSWORD = resolveSecret("ADMIN_PASSWORD", "admin123");
