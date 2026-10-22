import { buildApiUrl, callAdGuardAPI, type DNSServerSettings, getDnsServerId } from "./adguard-api";
import { isCoveredByAllowRule } from "./domain-helpers";

type UserRules = DNSServerSettings["user_rules_settings"];

const ALLOW_RULE = /^@@\|\|([^^]+)\^$/;

function allowRule(domain: string): string {
  return `@@||${domain}^`;
}

function allowedDomainsIn(rules: string[]): Set<string> {
  return new Set(rules.flatMap((rule) => ALLOW_RULE.exec(rule)?.[1] ?? []));
}

async function getUserRules(): Promise<UserRules> {
  const response = await callAdGuardAPI(buildApiUrl(`/oapi/v1/dns_servers/${getDnsServerId()}`));
  if (!response.ok) {
    throw new Error(`Failed to get DNS server: ${response.status} ${await response.text()}`);
  }
  const dnsServer = (await response.json()) as { settings: DNSServerSettings };
  return dnsServer.settings.user_rules_settings;
}

async function putUserRules(enabled: boolean, rules: string[]): Promise<void> {
  const response = await callAdGuardAPI(buildApiUrl(`/oapi/v1/dns_servers/${getDnsServerId()}/settings`), {
    method: "PUT",
    body: JSON.stringify({ user_rules_settings: { enabled, rules } }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update user rules: ${response.status} ${await response.text()}`);
  }
}

type UserRulesState = { enabled: boolean; allowed: string[] };

/**
 * Whether user rules take effect, and the domains that have an `@@||<domain>^` allow rule. `allowed` is an array
 * because useCachedPromise persists its data as JSON, which would turn a Set into {}.
 */
export async function getUserRulesState(): Promise<UserRulesState> {
  const { enabled, rules } = await getUserRules();
  return { enabled, allowed: [...allowedDomainsIn(rules)] };
}

/** Turns user rules on, keeping the rules as they are. Writes nothing when they are already on. */
export async function enableUserRules(): Promise<void> {
  const current = await getUserRules();
  if (!current.enabled) {
    await putUserRules(true, current.rules);
  }
}

/**
 * Adds an allow rule for each domain no existing allow rule covers. Writes nothing when every domain is covered.
 * `rulesEnabled` is false when user rules are off, so no allow rule takes effect.
 */
export async function allowDomains(
  domains: string[],
): Promise<{ added: string[]; alreadyAllowed: string[]; rulesEnabled: boolean }> {
  const current = await getUserRules();
  const allowed = allowedDomainsIn(current.rules);
  const added: string[] = [];
  const alreadyAllowed: string[] = [];

  for (const domain of new Set(domains)) {
    (isCoveredByAllowRule(domain, allowed) ? alreadyAllowed : added).push(domain);
  }

  if (added.length > 0) {
    await putUserRules(current.enabled, [...current.rules, ...added.map(allowRule)]);
  }
  return { added, alreadyAllowed, rulesEnabled: current.enabled };
}

/** Removes the allow rules for these domains. Writes nothing when none of them are present. */
export async function removeAllowRules(domains: string[]): Promise<void> {
  const current = await getUserRules();
  const toRemove = new Set(domains.map(allowRule));
  const rules = current.rules.filter((rule) => !toRemove.has(rule));

  if (rules.length !== current.rules.length) {
    await putUserRules(current.enabled, rules);
  }
}
