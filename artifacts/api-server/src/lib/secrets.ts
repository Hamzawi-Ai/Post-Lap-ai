import { logger } from "./logger";

const isProduction = process.env.NODE_ENV === "production";

// Values that are only safe in non-production environments. If one of these is
// explicitly configured while NODE_ENV=production, the deployment is insecure
// and the server must refuse to start rather than silently run with a public
// secret (see docs/FINAL_AUDIT_REPORT.md — C1).
const PLACEHOLDER_VALUES = new Set(["dev-secret", "admin123", "change-me-in-production"]);

function resolveSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) {
    if (isProduction && PLACEHOLDER_VALUES.has(value)) {
      logger.error(
        { secret: name },
        "Refusing to start with a placeholder secret in production",
      );
      throw new Error(
        `Insecure value for ${name}: "${value}" is a placeholder and must be replaced when NODE_ENV=production`,
      );
    }
    return value;
  }
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
