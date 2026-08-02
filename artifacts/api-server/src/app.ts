import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
