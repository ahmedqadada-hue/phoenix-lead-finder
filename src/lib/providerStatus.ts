import { db } from "./db";
import { AI_PROVIDERS, SEARCH_PROVIDERS, isUsable, remaining } from "./providers/connections";

/** Real readiness of every integration, read from the database (never assumed). */
export async function providerReadiness(organizationId: string) {
  const rows = await db.providerConnection.findMany({ where: { organizationId } });
  const search = SEARCH_PROVIDERS.map((p) => {
    const c = rows.find((r) => r.kind === "SEARCH" && r.provider === p.id) ?? null;
    return { def: p, conn: c, usable: !!c && isUsable(c, p.requiresKey), remaining: c ? remaining(c) : 0 };
  });
  const ai = AI_PROVIDERS.map((p) => {
    const c = rows.find((r) => r.kind === "AI" && r.provider === p.id) ?? null;
    return { def: p, conn: c, usable: !!c && isUsable(c, true), remaining: c ? remaining(c) : 0 };
  });
  return {
    search, ai,
    hasPlaces: search.some((s) => s.def.kind === "places" && s.usable),
    hasWeb: search.some((s) => s.def.kind === "web" && s.usable),
    hasAI: ai.some((a) => a.usable),
  };
}
