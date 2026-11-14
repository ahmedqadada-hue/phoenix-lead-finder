// Outbound-request safety. Every URL that originates from search results,
// websites or users goes through safeFetch(), which refuses private networks.
import { lookup as dnsLookup } from "node:dns";
import net from "node:net";
import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

export class UnsafeUrlError extends Error {}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (v.startsWith("::ffff:")) return true;
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8:");
  }
  return true;
}

/** Static checks that need no network: scheme, credentials, port, literal IPs, internal names. */
export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeUrlError("Invalid URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (u.username || u.password) throw new UnsafeUrlError("Credentials in URLs are not allowed");
  if (u.port && u.port !== "80" && u.port !== "443") throw new UnsafeUrlError("Non-standard ports are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(host)) { if (isPrivateAddress(host)) throw new UnsafeUrlError("Private address"); }
  else if (host === "localhost" || !host.includes(".") || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) throw new UnsafeUrlError("Internal host name");
  return u;
}

// The address is validated at connect time, so DNS rebinding cannot swap in a private IP.
const guardedAgent = new Agent({
  connect: {
    lookup(hostname, options, cb) {
      dnsLookup(hostname, { ...(options as object), all: true }, (err, addrs) => {
        if (err) return (cb as any)(err);
        const list = (Array.isArray(addrs) ? addrs : [addrs]) as { address: string; family: number }[];
        const bad = list.find((a) => isPrivateAddress(a.address));
        if (bad || !list.length) return (cb as any)(new UnsafeUrlError(`Refused: ${hostname} resolves to a private address`));
        if ((options as any)?.all) return (cb as any)(null, list);
        (cb as any)(null, list[0].address, list[0].family);
      });
    },
  },
  headersTimeout: 15000, bodyTimeout: 15000,
});

let proxyAgent: Dispatcher | null = null;
function dispatcher(): Dispatcher {
  // Optional outbound proxy (PHOENIX_EGRESS_PROXY). When set, the proxy resolves DNS,
  // so it must itself be unable to reach your private network.
  const proxy = process.env.PHOENIX_EGRESS_PROXY;
  if (proxy) return (proxyAgent ??= new ProxyAgent(proxy));
  return guardedAgent;
}

export function crawlerUserAgent(): string {
  const contact = process.env.CRAWLER_CONTACT ? `; ${process.env.CRAWLER_CONTACT}` : "";
  return `PhoenixLeadFinder/1.0 (+business contact lookup${contact})`;
}

export interface SafeResponse { status: number; url: string; contentType: string; text: string }

/** GET with redirect re-validation, timeout and a response-size cap. */
export async function safeFetch(raw: string, opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {}): Promise<SafeResponse> {
  let url = assertSafeUrl(raw);
  const maxBytes = opts.maxBytes ?? 1_500_000;
  for (let hop = 0; hop < 5; hop++) {
    const res = await undiciFetch(url, {
      redirect: "manual",
      dispatcher: dispatcher(),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
      headers: { "user-agent": crawlerUserAgent(), accept: opts.accept ?? "text/html,application/xhtml+xml", "accept-language": "ar,en;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) throw new Error("Redirect without location");
      url = assertSafeUrl(new URL(loc, url).toString());
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); break; }
      chunks.push(value);
    }
    return { status: res.status, url: url.toString(), contentType: res.headers.get("content-type") ?? "", text: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("Too many redirects");
}

/** JSON calls to fixed, trusted provider API hosts (search / AI providers). */
export async function apiFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new UnsafeUrlError("Provider APIs must use https");
  const proxy = process.env.PHOENIX_EGRESS_PROXY;
  return undiciFetch(u, {
    method: init.method ?? "GET", headers: init.headers, body: init.body,
    dispatcher: proxy ? (proxyAgent ??= new ProxyAgent(proxy)) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 30000),
  });
}
