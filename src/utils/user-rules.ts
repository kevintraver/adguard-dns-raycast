import { buildApiUrl, callAdGuardAPI, type DNSServerSettings, getDnsServerId } from "./adguard-api";

type UserRules = DNSServerSettings["user_rules_settings"];

const ALLOW_RULE = /^@@\|\|([^^]+)\^$/;

function allowRule(domain: string): string {
  return `@@||${domain}^`;
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

/** Domains that have an `@@||<domain>^` allow rule. */
export async function getAllowedDomains(): Promise<Set<string>> {
  const { rules } = await getUserRules();
  return new Set(rules.flatMap((rule) => ALLOW_RULE.exec(rule)?.[1] ?? []));
}

/** Adds an allow rule for each domain that lacks one. Writes nothing when every domain already has its rule. */
export async function allowDomains(domains: string[]): Promise<{ added: string[]; alreadyAllowed: string[] }> {
  const current = await getUserRules();
  const existing = new Set(current.rules);
  const added: string[] = [];
  const alreadyAllowed: string[] = [];

  for (const domain of new Set(domains)) {
    (existing.has(allowRule(domain)) ? alreadyAllowed : added).push(domain);
  }

  if (added.length > 0) {
    await putUserRules(current.enabled, [...current.rules, ...added.map(allowRule)]);
  }
  return { added, alreadyAllowed };
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
