import { db } from "./db";
import type { MessageContext } from "./messages";

/** Server-only: gathers the verified facts a message may mention. */
export async function buildMessageContext(leadId: string, organizationId: string, serviceOverride?: string): Promise<MessageContext | null> {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId }, include: { signals: { orderBy: { createdAt: "desc" } }, analyses: { orderBy: { createdAt: "desc" }, take: 1 }, campaign: true, organization: true } });
  if (!lead) return null;
  // Only evidenced, non-uncertain signals may be mentioned in a message.
  const signal = lead.signals.find((s) => !s.uncertain) ?? null;
  const service = serviceOverride?.trim() || signal?.suggestedService || lead.analyses[0]?.suggestedServices[0] || lead.campaign?.services[0] || lead.organization.agencyServices[0] || "";
  const o = lead.organization;
  return { company: lead.name, city: lead.city, service, signal: signal?.title ?? null, agencyName: o.agencyName, agencyDescription: o.agencyDescription, agencyWebsite: o.agencyWebsite, agencyPortfolio: o.agencyPortfolio, agencyContact: o.agencyContact };
}

