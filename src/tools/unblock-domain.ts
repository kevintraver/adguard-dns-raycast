import { Action, Tool } from "@raycast/api";
import { getRootDomain } from "../utils/domain-helpers";
import { allowDomains } from "../utils/user-rules";

function stripRuleSyntax(domain: string): string {
  return domain
    .replace(/^@@\|\|/, "")
    .replace(/\^+$/, "")
    .trim();
}

type Input = {
  /**
   * Array of domains to unblock (e.g., ["netflix.com", "nflxvideo.net"]).
   * Multiple domains can be unblocked at once. Do not include AdGuard DNS syntax
   * like @@|| or ^ - just provide the plain domain names.
   */
  domains: string[];
};

/**
 * Adds whitelist rules to unblock one or more domains in AdGuard DNS.
 *
 * This tool creates whitelist rules using AdGuard DNS syntax (@@||domain.com^)
 * and updates the DNS server settings. It checks for existing whitelist rules
 * to avoid duplicates and reports which domains were successfully unblocked.
 *
 * IMPORTANT: A native confirmation dialog will be shown to the user before
 * unblocking any domains. The tool will only execute if the user confirms.
 */
export default async function tool(input: Input): Promise<string> {
  try {
    if (!input.domains || input.domains.length === 0) {
      return "Error: No domains specified to unblock";
    }

    const { added: unblockedRootDomains, alreadyAllowed: alreadyWhitelisted } = await allowDomains(
      input.domains.map((domain) => getRootDomain(stripRuleSyntax(domain))),
    );

    if (unblockedRootDomains.length === 0) {
      const count = alreadyWhitelisted.length;
      return `All ${count} root domain${count !== 1 ? "s are" : " is"} already whitelisted:\n${alreadyWhitelisted.map((d) => `• ${d}`).join("\n")}\n\nNo changes needed.`;
    }

    let result = `✅ Unblocked ${unblockedRootDomains.length} root domain${unblockedRootDomains.length !== 1 ? "s" : ""}`;
    result += `:\n${unblockedRootDomains.map((d) => `• ${d}`).join("\n")}`;

    if (alreadyWhitelisted.length > 0) {
      result += `\n\n⚠️ ${alreadyWhitelisted.length} already whitelisted:\n`;
      result += alreadyWhitelisted.map((d) => `• ${d}`).join("\n");
    }

    result += `\n\nTest your service to confirm it's working.`;

    return result;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ Error unblocking domains: ${error.message}`;
    }
    return `❌ Error unblocking domains: ${String(error)}`;
  }
}

/**
 * Native confirmation dialog shown before unblocking domains.
 * This keeps the user in control of DNS whitelist modifications.
 * Shows root domains that will be unblocked (which may differ from subdomains provided).
 */
export const confirmation: Tool.Confirmation<Input> = async (input) => {
  if (!input.domains || input.domains.length === 0) {
    return undefined; // Skip confirmation for invalid input
  }

  // Extract unique root domains
  const rootDomains = new Set<string>();
  const domainMap = new Map<string, string[]>(); // root -> subdomains

  for (const domain of input.domains) {
    const cleanDomain = stripRuleSyntax(domain);
    const rootDomain = getRootDomain(cleanDomain);
    rootDomains.add(rootDomain);

    if (!domainMap.has(rootDomain)) {
      domainMap.set(rootDomain, []);
    }
    if (cleanDomain !== rootDomain) {
      domainMap.get(rootDomain)!.push(cleanDomain);
    }
  }

  const rootArray = Array.from(rootDomains);

  return {
    message: `Unblock ${rootArray.length} root domain${rootArray.length > 1 ? "s" : ""}?`,
    info: rootArray.map((root) => {
      const subs = domainMap.get(root) || [];
      const value = subs.length > 0 ? `${root} (includes ${subs.join(", ")})` : root;
      return {
        name: "Will unblock",
        value,
      };
    }),
    style: Action.Style.Regular,
  };
};
