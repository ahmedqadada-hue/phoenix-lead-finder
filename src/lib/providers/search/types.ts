export type ProviderErrorKind = "AUTH" | "QUOTA" | "RATE_LIMIT" | "TEMPORARY" | "BAD_REQUEST" | "CONFIG";

export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message: string) { super(message); }
  get retryable() { return this.kind === "TEMPORARY" || this.kind === "RATE_LIMIT"; }
}

export interface OsmExtra {
  name: string;
  city: string;
  website?: string;
  phone?: string;
  whatsapp?: string;
  socialUrls: string[];
  category?: string;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string | null;
  osm?: OsmExtra;
}

export interface SearchRequest {
  query: string;        // web providers
  city: string;         // places providers
  countryCode: string;  // ISO-3166 alpha-2, may be ""
  industry: string;     // industry key or free text
  language: string;     // "ar" | "en" | "both"
  limit: number;
}

export interface SearchProvider {
  id: string;
  label: string;
  kind: "web" | "places";
  requiresKey: boolean;
  signupUrl: string;
  defaultMonthlyLimit: number; // conservative cap kept below the free allowance; 0 = no cap
  noteKey: string;             // i18n key describing the free allowance
  search(req: SearchRequest, apiKey: string | null): Promise<SearchHit[]>;
  /** Makes one cheap real call to prove the connection works. */
  test(apiKey: string | null): Promise<void>;
}

export async function failFromStatus(res: { status: number; text(): Promise<string> }, label: string): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 300);
  const msg = `${label}: HTTP ${res.status} ${body}`;
  if (res.status === 401 || res.status === 403) throw new ProviderError("AUTH", msg);
  if (res.status === 402) throw new ProviderError("QUOTA", msg);
  if (res.status === 429) throw new ProviderError(/quota|limit exceeded|credits/i.test(body) ? "QUOTA" : "RATE_LIMIT", msg);
  if (res.status >= 500) throw new ProviderError("TEMPORARY", msg);
  throw new ProviderError("BAD_REQUEST", msg);
}

export function wrapNetwork(e: unknown, label: string): never {
  if (e instanceof ProviderError) throw e;
  throw new ProviderError("TEMPORARY", `${label}: ${e instanceof Error ? e.message : "network error"}`);
}
