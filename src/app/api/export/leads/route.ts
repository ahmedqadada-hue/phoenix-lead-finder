import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, getCurrentUser, isManager } from "@/lib/auth";
import { leadOrder, leadWhere } from "@/lib/leadFilters";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!isManager(u)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const f = Object.fromEntries(req.nextUrl.searchParams);
  const leads = await db.lead.findMany({ where: leadWhere(u, f), orderBy: leadOrder(f.sort), take: 5000, include: { socials: true, campaign: { select: { name: true } }, assignedTo: { select: { name: true } }, sources: { select: { url: true }, take: 3 } } });
  const social = (l: (typeof leads)[number], p: string) => l.socials.find((s) => s.platform === p)?.url ?? "";
  const csv = toCsv(
    ["name", "industry", "country", "city", "website", "whatsapp", "phone", "instagram", "facebook", "linkedin", "tiktok", "youtube", "score", "verification", "status", "campaign", "assigned_to", "discovered_at", "last_checked_at", "sources"],
    leads.map((l) => [l.name, l.industry, l.country, l.city, l.website ?? "", l.whatsapp ? `+${l.whatsapp}` : "", l.phone ? `+${l.phone}` : "", social(l, "instagram"), social(l, "facebook"), social(l, "linkedin"), social(l, "tiktok"), social(l, "youtube"), l.score, l.verification, l.status, l.campaign?.name ?? "", l.assignedTo?.name ?? "", l.discoveredAt.toISOString(), l.lastCheckedAt.toISOString(), l.sources.map((s) => s.url).filter(Boolean).join(" | ")]),
  );
  await audit(u, "LEADS_EXPORT_CSV", "Lead", "", { rows: leads.length });
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="phoenix-leads-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
