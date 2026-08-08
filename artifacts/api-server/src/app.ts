import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", true);

if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const host = (req.headers.host ?? "").toLowerCase();
    const bareHost = host.split(":")[0];
    if (bareHost === "www.postlapai.com") {
      const redirectUrl = `${req.protocol}://postlapai.com${req.originalUrl}`;
      return res.redirect(301, redirectUrl);
    }
    next();
  });
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = [
  "https://postlapai.com",
  "https://www.postlapai.com",
];
const extraOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  const requestHost = (req.headers.host ?? "").toLowerCase();
  const isSameOrigin = (origin: string): boolean => {
    try {
      return new URL(origin).host === requestHost;
    } catch {
      return false;
    }
  };
  cors({
    origin: (origin, callback) => {
      if (!origin || !process.env.NODE_ENV || process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }
      if (
        allowedOrigins.includes(origin) ||
        extraOrigins.includes(origin) ||
        isSameOrigin(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })(req, res, next);
});
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded media files from the storage/ directory.
// Files are stored at storage/companies/{companyId}/{category}/{filename}
// and are publicly accessible at /uploads/companies/...
// Security headers prevent MIME-sniffing and script execution in the browser.
const storageRoot = path.resolve(__dirname, "../storage");
app.use("/uploads", (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  next();
}, express.static(storageRoot));

app.use("/api", router);

// Global error handler — must be the last app.use call and must have exactly
// four parameters so Express recognises it as an error-handling middleware.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status = (err as { status?: number; statusCode?: number }).status ?? (err as { status?: number; statusCode?: number }).statusCode ?? 500;
  const body: { error: string; stack?: string } = { error: "internal_error" };
  if (process.env.NODE_ENV !== "production") {
    body.stack = err.stack;
  }
  res.status(status).json(body);
});

export default app;
