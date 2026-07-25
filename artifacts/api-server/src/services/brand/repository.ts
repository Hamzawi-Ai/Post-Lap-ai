import { db, userBrandMemoryTable, businessProfilesTable, companiesTable, usersTable, type Plan } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export interface BrandMemoryRow {
  id: number;
  user_id: number;
  company_id: number | null;
  business_name: string | null;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  primary_colors: string | null;
  preferred_style: string | null;
  liked_posts: unknown;
  notes: string | null;
  design_samples: string | null;
  brand_onboarded: boolean;
  updated_at: Date;
}

export function parseDesignSamples(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function findBrandMemoryByUserId(userId: number): Promise<BrandMemoryRow | null> {
  const [row] = await db
    .select()
    .from(userBrandMemoryTable)
    .where(eq(userBrandMemoryTable.user_id, userId))
    .limit(1);
  return row ?? null;
}

export async function findBrandMemoryByCompanyId(companyId: number): Promise<BrandMemoryRow | null> {
  const [row] = await db
    .select()
    .from(userBrandMemoryTable)
    .where(eq(userBrandMemoryTable.company_id, companyId))
    .limit(1);
  return row ?? null;
}

export async function upsertBrandMemory(
  userId: number,
  fields: Partial<Omit<BrandMemoryRow, "id" | "user_id" | "updated_at">>,
) {
  const existing = await db
    .select({ id: userBrandMemoryTable.id })
    .from(userBrandMemoryTable)
    .where(eq(userBrandMemoryTable.user_id, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userBrandMemoryTable)
      .set({ ...fields, updated_at: new Date() })
      .where(eq(userBrandMemoryTable.user_id, userId));
  } else {
    await db.insert(userBrandMemoryTable).values({ user_id: userId, ...fields });
  }
}

export async function findCompanyByUserId(userId: number) {
  const [user] = await db
    .select({ company_id: usersTable.company_id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user?.company_id) return null;

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, user.company_id))
    .limit(1);

  return company ?? null;
}

export async function createCompany(data: { name: string; plan: Plan }) {
  const [company] = await db
    .insert(companiesTable)
    .values(data)
    .returning();
  return company;
}

export async function linkUserToCompany(userId: number, companyId: number) {
  await db
    .update(usersTable)
    .set({ company_id: companyId })
    .where(eq(usersTable.id, userId));
}

// ── Brand Memory ────────────────────────────────────────────────────────────

export async function createBrandMemory(
  userId: number,
  fields: Partial<Omit<BrandMemoryRow, "id" | "user_id" | "updated_at">>,
) {
  const [row] = await db
    .insert(userBrandMemoryTable)
    .values({ user_id: userId, ...fields })
    .returning();
  return row;
}

export async function updateBrandMemory(
  userId: number,
  fields: Partial<Omit<BrandMemoryRow, "id" | "user_id" | "updated_at">>,
) {
  await db
    .update(userBrandMemoryTable)
    .set({ ...fields, updated_at: new Date() })
    .where(eq(userBrandMemoryTable.user_id, userId));
}

export async function appendDesignSample(userId: number, dataUrl: string) {
  const existing = await db
    .select({ design_samples: userBrandMemoryTable.design_samples })
    .from(userBrandMemoryTable)
    .where(eq(userBrandMemoryTable.user_id, userId))
    .limit(1)
    .then((r) => r[0]?.design_samples ?? null);

  let arr: string[] = [];
  if (existing) {
    try { arr = JSON.parse(existing) as string[]; } catch { arr = []; }
  }
  arr = [...arr, dataUrl].slice(-5);

  await db
    .update(userBrandMemoryTable)
    .set({ design_samples: JSON.stringify(arr), updated_at: new Date() })
    .where(eq(userBrandMemoryTable.user_id, userId));
}

// ── Business Profiles (Agency / Level 5) ────────────────────────────────────

export async function findBusinessProfilesByUserId(userId: number) {
  return db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.user_id, userId))
    .orderBy(businessProfilesTable.created_at);
}

export async function createBusinessProfile(
  data: typeof businessProfilesTable.$inferInsert,
) {
  const [profile] = await db.insert(businessProfilesTable).values(data).returning();
  return profile;
}

export async function updateBusinessProfile(
  id: number,
  userId: number,
  fields: Partial<Omit<typeof businessProfilesTable.$inferInsert, "id" | "user_id">>,
) {
  const [profile] = await db
    .update(businessProfilesTable)
    .set({ ...fields, updated_at: new Date() })
    .where(and(eq(businessProfilesTable.id, id), eq(businessProfilesTable.user_id, userId)))
    .returning();
  return profile ?? null;
}

export async function deleteBusinessProfile(id: number, userId: number) {
  await db
    .delete(businessProfilesTable)
    .where(and(eq(businessProfilesTable.id, id), eq(businessProfilesTable.user_id, userId)));
}