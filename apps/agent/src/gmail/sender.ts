import { senderDomain } from "@monara/contracts";

/** The authentication service id Gmail writes on mail it received itself. */
const GMAIL_AUTHSERV_ID = "mx.google.com";

/** Suffixes anyone can register under, so they never count as a shared parent domain. */
const PUBLIC_SUFFIXES = new Set([
  "id",
  "co.id",
  "ac.id",
  "or.id",
  "go.id",
  "web.id",
  "my.id",
  "biz.id",
  "net.id",
  "sch.id",
  "com",
  "net",
  "org",
]);

/**
 * True when one domain is the other or a subdomain of it (relaxed DMARC-style
 * alignment), never through a public suffix such as co.id.
 */
function aligned(domain: string, fromDomain: string): boolean {
  const a = domain.toLowerCase().replace(/\.$/, "");
  const b = fromDomain.toLowerCase().replace(/\.$/, "");
  if (a === b) return true;
  const [child, parent] = a.endsWith(`.${b}`) ? [a, b] : b.endsWith(`.${a}`) ? [b, a] : [];
  return child !== undefined && parent !== undefined && !PUBLIC_SUFFIXES.has(parent);
}

function propertyDomain(result: string, property: string): string | null {
  const match = result.match(
    new RegExp(`${property.replace(".", "\\.")}=(?:[^\\s;@]*@)?([a-z0-9.-]+)`, "i"),
  );
  return match ? match[1] : null;
}

/**
 * Whether Gmail authenticated the sender's domain: DKIM passed with a signing domain
 * aligned to the From domain, or SPF passed for an aligned envelope sender. Only
 * Gmail's own Authentication-Results header counts, and only the first one, which
 * Gmail adds on top; a sender can forge headers further down but not that one.
 */
export function isSenderVerified(
  fromAddress: string | null,
  authenticationResults: readonly string[],
): boolean {
  if (!fromAddress) return false;
  const fromDomain = senderDomain(fromAddress);
  const gmail = authenticationResults.find((value) =>
    value.trim().toLowerCase().startsWith(`${GMAIL_AUTHSERV_ID};`),
  );
  if (!gmail || gmail !== authenticationResults[0]) return false;

  for (const result of gmail.split(";").map((part) => part.trim())) {
    const dkim = /^dkim=pass\b/i.test(result)
      ? (propertyDomain(result, "header.d") ?? propertyDomain(result, "header.i"))
      : null;
    if (dkim && aligned(dkim, fromDomain)) return true;
    const spf = /^spf=pass\b/i.test(result) ? propertyDomain(result, "smtp.mailfrom") : null;
    if (spf && aligned(spf, fromDomain)) return true;
  }
  return false;
}
