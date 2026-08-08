/**
 * PostLab Operational Intelligence — summarized metrics.
 *
 * Produces structured operational summaries from the recorded event stream
 * (operational_events). Hamzawi / authorized supervisory tooling consume these
 * summaries — never raw event rows. All values are derived from actual recorded
 * events; nothing is guessed from conversation memory.
 *
 * Aggregation is intentionally simple (JS over the period's rows) — no heavy
 * analytics engine, appropriate for the current Beta volume.
 */
import { and, gte, lt, inArray } from "drizzle-orm";
import { db, operationalEventsTable, usersTable } from "@workspace/db";

export type TimePeriod = "today" | "yesterday" | "last_7_days" | "current_month";

export interface ProviderUsage {
  provider: string;
  model: string | null;
  attempts: number;
  successes: number;
  failures: number;
  /** Estimated USD (null when pricing unknown). */
  estimatedCost: number | null;
}

export interface AccountUsage {
  userId: number;
  email: string | null;
  checks: number;
  textGenerations: number;
  images: number;
  /** Estimated USD (null when pricing unknown). */
  estimatedCost: number | null;
}

export interface OperationalOverview {
  period: TimePeriod;
  from: string;
  to: string;
  activeAccounts: number;
  checks: number;
  textGenerations: number;
  textFailures: number;
  imageAttempts: number;
  successfulImages: number;
  failedImages: number;
  providerErrors: number;
  /** Estimated total AI cost (USD). Null when nothing is costable. */
  estimatedAiCost: number | null;
  estimatedImageCost: number | null;
  estimatedTextCost: number | null;
  estimatedCheckCost: number | null;
  byProvider: ProviderUsage[];
  topAccounts: AccountUsage[];
  reliability: {
    imageFailureRate: number | null;
    textFailureRate: number | null;
    errorsByProvider: Array<{ provider: string; errors: number }>;
  };
  anomalies: string[];
}

/**
 * Deterministic anomaly thresholds (documented, centralized). Beta observation
 * only — these NEVER restrict usage.
 */
export const ANOMALY_THRESHOLDS = {
  /** image failure rate above which we flag reliability. */
  maxImageFailureRate: 0.2,
  /** text failure rate above which we flag reliability. */
  maxTextFailureRate: 0.2,
  /** estimated daily cost (USD) above which we flag spend. */
  highDailyCostUsd: 20,
  /** per-account images per period above which we flag heavy usage. */
  heavyImageAccountThreshold: 50,
};

function periodRange(period: TimePeriod): { from: Date; to: Date } {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  switch (period) {
    case "today":
      return { from: startOfToday, to: now };
    case "yesterday": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      return { from: start, to: startOfToday };
    }
    case "last_7_days":
      return { from: new Date(now.getTime() - 7 * 86_400_000), to: now };
    case "current_month":
      return { from: startOfMonth, to: now };
  }
}

function sumCost(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return Number(nums.reduce((a, b) => a + b, 0).toFixed(6));
}

export class OperationalMetrics {
  static async overview(period: TimePeriod): Promise<OperationalOverview> {
    const { from, to } = periodRange(period);

    const rows = await db
      .select({
        created_at: operationalEventsTable.created_at,
        user_id: operationalEventsTable.user_id,
        company_id: operationalEventsTable.company_id,
        event_type: operationalEventsTable.event_type,
        provider: operationalEventsTable.provider,
        model: operationalEventsTable.model,
        success: operationalEventsTable.success,
        quantity: operationalEventsTable.quantity,
        estimated_cost: operationalEventsTable.estimated_cost,
      })
      .from(operationalEventsTable)
      .where(and(gte(operationalEventsTable.created_at, from), lt(operationalEventsTable.created_at, to)));

    let checks = 0;
    let textGenerations = 0;
    let textFailures = 0;
    let imageAttempts = 0;
    let successfulImages = 0;
    let failedImages = 0;
    let providerErrors = 0;

    const imageCosts: Array<number | null> = [];
    const textCosts: Array<number | null> = [];
    const checkCosts: Array<number | null> = [];
    const allCosts: Array<number | null> = [];

    const byProvider = new Map<string, ProviderUsage>();
    const accountMap = new Map<number, AccountUsage>();
    const activeAccountIds = new Set<number>();
    const errorCountsByProvider = new Map<string, number>();

    for (const row of rows) {
      const cost = row.estimated_cost ?? null;
      allCosts.push(cost);

      const providerKey = `${row.provider ?? "unknown"}|${row.model ?? "unknown"}`;
      const bucket =
        byProvider.get(providerKey) ??
        ({ provider: row.provider ?? "unknown", model: row.model ?? null, attempts: 0, successes: 0, failures: 0, estimatedCost: null } satisfies ProviderUsage);
      bucket.attempts += 1;
      if (row.success === true) bucket.successes += 1;
      if (row.success === false) bucket.failures += 1;
      bucket.estimatedCost = sumCost([bucket.estimatedCost, cost]);
      byProvider.set(providerKey, bucket);

      if (row.user_id != null) {
        activeAccountIds.add(row.user_id);
        const acc =
          accountMap.get(row.user_id) ??
          ({ userId: row.user_id, email: null, checks: 0, textGenerations: 0, images: 0, estimatedCost: null } satisfies AccountUsage);
        acc.estimatedCost = sumCost([acc.estimatedCost, cost]);
        accountMap.set(row.user_id, acc);
      }

      switch (row.event_type) {
        case "policy_check":
          checks += 1;
          checkCosts.push(cost);
          if (row.user_id != null) accountMap.get(row.user_id)!.checks += 1;
          break;
        case "text_generation":
          textGenerations += 1;
          textCosts.push(cost);
          if (row.success === false) textFailures += 1;
          if (row.user_id != null) accountMap.get(row.user_id)!.textGenerations += 1;
          break;
        case "image_generation":
          imageAttempts += 1;
          successfulImages += 1;
          imageCosts.push(cost);
          if (row.user_id != null) accountMap.get(row.user_id)!.images += 1;
          break;
        case "image_generation_failure":
          imageAttempts += 1;
          failedImages += 1;
          imageCosts.push(cost);
          if (row.user_id != null) accountMap.get(row.user_id)!.images += 1;
          break;
        case "provider_error":
          providerErrors += 1;
          {
            const p = row.provider ?? "unknown";
            errorCountsByProvider.set(p, (errorCountsByProvider.get(p) ?? 0) + 1);
          }
          break;
      }
    }

    // Top accounts: enrich with emails, order by estimated cost desc (nulls last).
    const userIds = [...accountMap.keys()];
    let emailById = new Map<number, string | null>();
    if (userIds.length > 0) {
      const users = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds));
      emailById = new Map(users.map((u) => [u.id, u.email]));
    }
    const topAccounts = [...accountMap.values()]
      .map((a) => ({ ...a, email: emailById.get(a.userId) ?? null }))
      .sort((a, b) => {
        if (a.estimatedCost == null && b.estimatedCost == null) return b.checks + b.textGenerations + b.images - (a.checks + a.textGenerations + a.images);
        if (a.estimatedCost == null) return 1;
        if (b.estimatedCost == null) return -1;
        return b.estimatedCost - a.estimatedCost;
      })
      .slice(0, 10);

    const imageFailureRate =
      imageAttempts > 0 ? Number((failedImages / imageAttempts).toFixed(4)) : null;
    const textFailureRate =
      textGenerations > 0 ? Number((textFailures / textGenerations).toFixed(4)) : null;

    // Deterministic anomaly flags (observation only — no restriction).
    const anomalies: string[] = [];
    if (imageFailureRate != null && imageFailureRate > ANOMALY_THRESHOLDS.maxImageFailureRate) {
      anomalies.push(`ارتفاع نسبة فشل توليد الصور: ${Math.round(imageFailureRate * 100)}%`);
    }
    if (textFailureRate != null && textFailureRate > ANOMALY_THRESHOLDS.maxTextFailureRate) {
      anomalies.push(`ارتفاع نسبة فشل توليد النصوص: ${Math.round(textFailureRate * 100)}%`);
    }
    if (providerErrors > 0) {
      anomalies.push(`${providerErrors} خطأ موفر خلال الفترة`);
    }
    const totalCost = sumCost(allCosts);
    if (totalCost != null && totalCost > ANOMALY_THRESHOLDS.highDailyCostUsd) {
      anomalies.push(`تكلفة تقديرية عالية خلال الفترة: $${totalCost}`);
    }
    const heavyAccounts = topAccounts.filter((a) => a.images >= ANOMALY_THRESHOLDS.heavyImageAccountThreshold);
    for (const a of heavyAccounts) {
      anomalies.push(`استخدام صور مكثف: ${a.email ?? `مستخدم ${a.userId}`} (${a.images} صورة)`);
    }

    return {
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      activeAccounts: activeAccountIds.size,
      checks,
      textGenerations,
      textFailures,
      imageAttempts,
      successfulImages,
      failedImages,
      providerErrors,
      estimatedAiCost: sumCost(allCosts),
      estimatedImageCost: sumCost(imageCosts),
      estimatedTextCost: sumCost(textCosts),
      estimatedCheckCost: sumCost(checkCosts),
      byProvider: [...byProvider.values()].sort((a, b) => b.attempts - a.attempts),
      topAccounts,
      reliability: {
        imageFailureRate,
        textFailureRate,
        errorsByProvider: [...errorCountsByProvider.entries()]
          .map(([provider, errors]) => ({ provider, errors }))
          .sort((a, b) => b.errors - a.errors),
      },
      anomalies,
    };
  }

  static isPeriod(value: string): value is TimePeriod {
    return value === "today" || value === "yesterday" || value === "last_7_days" || value === "current_month";
  }
}
