import { db } from "./db";
import { providerReadiness } from "./providerStatus";
import type { OutreachLead } from "@/components/LeadOutreach";

/** Everything the message composer / outreach panel needs for one lead. */
export async function outreachProps(leadId: string, organizationId: string) {
  const [lead, templates, ready] = await Promise.all([
    db.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { socials: true, messages: { where: { saved: true }, orderBy: { createdAt: "desc" }, take: 1 }, signals: { where: { uncertain: false }, take: 1 }, analyses: { orderBy: { createdAt: "desc" }, take: 1 }, campaign: { select: { services: true } }, organization: { select: { agencyServices: true } } },
    }),
    db.messageTemplate.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    providerReadiness(organizationId),
  ]);
  if (!lead) return null;
  const outreachLead: OutreachLead = {
    id: lead.id, name: lead.name, country: lead.country, status: lead.status, whatsapp: lead.whatsapp, whatsappSource: lead.whatsappSource,
    socials: lead.socials.map((s) => ({ platform: s.platform, url: s.url, handle: s.handle, verified: s.verified, sourceUrl: s.sourceUrl })),
  };
  const defaultService = lead.signals[0]?.suggestedService || lead.analyses[0]?.suggestedServices[0] || lead.campaign?.services[0] || lead.organization.agencyServices[0] || "";
  return { lead: outreachLead, initialMessage: lead.messages[0]?.content ?? "", hasAI: ready.hasAI, templates, defaultService };
}
