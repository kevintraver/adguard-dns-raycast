import { buildApiUrl, callAdGuardAPI, getDnsServerId, DNSServerSettings } from "../utils/adguard-api";

type Input = {
  /** Array of domains to unblock (e.g., ["netflix.com", "nflxvideo.net"]). Multiple domains can be unblocked at once. */
  domains: string[];
};

/**
 * Adds whitelist rules to unblock one or more domains in AdGuard DNS.
 *
 * This tool creates whitelist rules using AdGuard DNS syntax (@@||domain.com^)
 * and updates the DNS server settings. It checks for existing whitelist rules
 * to avoid duplicates and reports which domains were successfully unblocked.
 */
export default async function tool(input: Input): Promise<string> {
  try {
    if (!input.domains || input.domains.length === 0) {
      return "Error: No domains specified to unblock";
    }

    const dnsServerId = getDnsServerId();

    // First, get current DNS server settings
    const getUrl = buildApiUrl(`/oapi/v1/dns_servers/${dnsServerId}`);
    const getResponse = await callAdGuardAPI(getUrl);

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      throw new Error(`Failed to get DNS server: ${getResponse.status} ${errorText}`);
    }

    const dnsServer = (await getResponse.json()) as { settings: DNSServerSettings };
    const currentSettings = dnsServer.settings;

    // Create whitelist rules using AdGuard DNS syntax
    const newRules: string[] = [];
    const alreadyWhitelisted: string[] = [];

    for (const domain of input.domains) {
      // Sanitize domain: remove any AdGuard syntax characters
      const cleanDomain = domain.replace(/^@@\|\|/, "").replace(/\^+$/, "").trim();
      const whitelistRule = `@@||${cleanDomain}^`;

      if (currentSettings.user_rules_settings.rules.includes(whitelistRule)) {
        alreadyWhitelisted.push(cleanDomain);
      } else {
        newRules.push(whitelistRule);
      }
    }

    // If all domains are already whitelisted, return early
    if (newRules.length === 0) {
      return `All ${input.domains.length} domain(s) are already whitelisted:\n${input.domains.map((d) => `• ${d}`).join("\n")}\n\nNo changes were made.`;
    }

    // Add new rules to existing rules
    const updatedRules = [...currentSettings.user_rules_settings.rules, ...newRules];

    // Update settings with new rules
    const putUrl = buildApiUrl(`/oapi/v1/dns_servers/${dnsServerId}/settings`);
    const putResponse = await callAdGuardAPI(putUrl, {
      method: "PUT",
      body: JSON.stringify({
        user_rules_settings: {
          enabled: currentSettings.user_rules_settings.enabled,
          rules: updatedRules,
        },
      }),
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(`Failed to update settings: ${putResponse.status} ${errorText}`);
    }

    // Build success message
    const newDomains = input.domains.filter((d) => !alreadyWhitelisted.includes(d));

    let result = `✅ Successfully unblocked ${newDomains.length} domain(s):\n\n`;
    result += newDomains.map((d) => `• ${d}`).join("\n");

    if (alreadyWhitelisted.length > 0) {
      result += `\n\n⚠️ Already whitelisted (${alreadyWhitelisted.length}):\n`;
      result += alreadyWhitelisted.map((d) => `• ${d}`).join("\n");
    }

    result += `\n\nWhitelist rules added: ${newRules.length}`;
    result += `\nTotal whitelist rules: ${updatedRules.length}`;

    result += `\n\n💡 Suggestion: Test your service now to see if the issue is resolved.`;

    return result;
  } catch (error) {
    if (error instanceof Error) {
      return `❌ Error unblocking domains: ${error.message}`;
    }
    return `❌ Error unblocking domains: ${String(error)}`;
  }
}
