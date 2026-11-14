import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { workFor } from "@/lib/discovery/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scheduled worker step for hosts without a long-running worker (Vercel Cron).
// Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically when the
// CRON_SECRET environment variable is set. Without the secret this endpoint refuses to run.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (secret.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const result = await workFor(45_000, { housekeeping: true });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return NextResponse.json({ ok: true, ...result });
}
