import { db, dashboardMode } from "@/db/client";
import { applications } from "@/db/schema";
import { sql } from "drizzle-orm";

// Liveness proof only (SKELETON.md) — reads the application count through
// the single `db` client singleton; never constructs its own connection or
// reads DASHBOARD_MODE directly (client.ts is the only module that does).
export async function GET() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(applications);

  return Response.json({ ok: true, mode: dashboardMode, applicationCount: count });
}
