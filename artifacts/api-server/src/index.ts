import app from "./app";
import { logger } from "./lib/logger";

// C1 guardrail (docs/FINAL_AUDIT_REPORT.md): every security-sensitive behavior
// (CORS allowlist, Secure cookie flag, dev-login endpoint, dev AI stubs, secret
// fallbacks) is keyed to NODE_ENV === "production". Refuse to start unless the
// operator has made the environment explicit, so the server can never boot into
// an ambiguous "not-production" mode that quietly disables those controls.
const knownModes = ["production", "development", "test"];
const nodeEnv = process.env.NODE_ENV;
if (!nodeEnv || !knownModes.includes(nodeEnv)) {
  throw new Error(
    `NODE_ENV must be explicitly set to one of: ${knownModes.join(", ")} ` +
      `(got ${JSON.stringify(nodeEnv ?? undefined)}). Refusing to start in an ambiguous environment.`,
  );
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, nodeEnv }, "Server listening");
});
