import { Router, type IRouter } from "express";
import { requireAdmin } from "./admin";
import { OperationalMetrics, type TimePeriod } from "../services/operational/metrics";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * PostLab Operational Intelligence — summarized operational metrics.
 * Admin-only. Returns derived summaries of the recorded event stream; never
 * raw event rows and never any prompts / image contents / secrets.
 */
router.get("/operational/overview", requireAdmin, async (req, res): Promise<void> => {
  const rawPeriod = typeof req.query.period === "string" ? req.query.period : "last_7_days";
  const period: TimePeriod = OperationalMetrics.isPeriod(rawPeriod) ? rawPeriod : "last_7_days";

  try {
    const overview = await OperationalMetrics.overview(period);
    res.json({ ok: true, ...overview });
  } catch (err) {
    logger.error({ err, period }, "Operational overview error");
    res.status(500).json({ error: "تعذر توليد التقرير التشغيلي" });
  }
});

export default router;
