/**
 * Domain parsing and manipulation utilities. Pure, so tests can import this file from plain Node.
 */

/**
 * Extracts the root domain from a subdomain
 * Examples:
 *   www.peacocktv.com → peacocktv.com
 *   api-global.netflix.com → netflix.com
 *   sessions.bugsnag.com → bugsnag.com
 *   example.co.uk → example.co.uk
 */
export function getRootDomain(domain: string): string {
  const parts = domain.split(".");

  // Handle common TLDs with country codes (e.g., .co.uk, .com.au)
  const twoPartTlds = ["co.uk", "com.au", "co.nz", "co.za", "com.br"];
  const lastTwoParts = parts.slice(-2).join(".");

  if (twoPartTlds.includes(lastTwoParts)) {
    // For domains like example.co.uk, return last 3 parts
    return parts.slice(-3).join(".");
  }

  // For standard TLDs, return last 2 parts (domain.tld)
  return parts.slice(-2).join(".");
}

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Extracts a hostname from a bare hostname, a URL, or an AdGuard rule (`@@||x.com^`, `||x.com^`).
 * Returns undefined when the input is not a dotted hostname.
 */
export function parseHostname(input: string): string | undefined {
  const hostname = input
    .trim()
    .toLowerCase()
    .replace(/^@@/, "")
    .replace(/^\|\|/, "")
    .replace(/\^.*$/, "")
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

  const labels = hostname.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return undefined;
  // An all-digit TLD means an IP address, whose "root" (e.g. "1.1") is not a domain anyone can allow.
  if (/^\d+$/.test(labels[labels.length - 1])) return undefined;
  return hostname;
}

/**
 * True when `domain` or one of its parent domains has an allow rule. `@@||x^` covers every subdomain of x.
 */
export function isCoveredByAllowRule(domain: string, allowed: ReadonlySet<string>): boolean {
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (allowed.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

export type BlockedDomain = {
  domain: string;
  root: string;
  attempts: number;
  lastSeen: number;
  devices: string[];
  rules: string[];
};

export type BlockedGroup = {
  root: string;
  attempts: number;
  lastSeen: number;
  subdomains: BlockedDomain[];
};

/** Groups blocked domains by root, most recently seen root first, each root's domains by attempts descending. */
export function groupByRoot(domains: BlockedDomain[]): BlockedGroup[] {
  const byRoot = new Map<string, BlockedDomain[]>();
  for (const domain of domains) {
    byRoot.set(domain.root, [...(byRoot.get(domain.root) ?? []), domain]);
  }
  return Array.from(byRoot, ([root, subdomains]) => ({
    root,
    attempts: subdomains.reduce((sum, { attempts }) => sum + attempts, 0),
    lastSeen: Math.max(...subdomains.map(({ lastSeen }) => lastSeen)),
    subdomains: subdomains.sort((a, b) => b.attempts - a.attempts),
  })).sort((a, b) => b.lastSeen - a.lastSeen);
}
