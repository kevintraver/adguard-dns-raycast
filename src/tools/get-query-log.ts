/**
 * Fetches DNS query logs and returns blocked domains grouped by root domain.
 * This tool shows what domains were blocked in a specified time window.
 */

import { fetchBlockedGroups } from "../utils/blocked-domains";

type Input = {
  /** Time window in minutes to search (default: 10) */
  minutes?: number;
};

export default async function getQueryLog(input: Input): Promise<string> {
  const minutes = input.minutes || 10;

  try {
    const groups = await fetchBlockedGroups(minutes);

    if (groups.length === 0) {
      return `No blocked domains found in the last ${minutes} minutes.`;
    }

    const domainCount = groups.reduce((sum, group) => sum + group.subdomains.length, 0);
    let output = `Found ${domainCount} blocked domain${domainCount !== 1 ? "s" : ""} in the last ${minutes} minutes:\n\n`;

    for (const group of groups) {
      output += `**${group.root}** (${group.attempts} attempts, ${getTimeAgo(group.lastSeen)})\n`;

      for (const subdomain of group.subdomains) {
        if (subdomain.domain !== group.root) {
          output += `  - ${subdomain.domain} (${subdomain.attempts} attempts)\n`;
        }
      }
      output += "\n";
    }

    output += `To unblock domains, use the unblock-domain tool with the root domains you want to allow.`;

    return output;
  } catch (error) {
    return `Error loading query log: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function getTimeAgo(millis: number): string {
  const diffMins = Math.floor((Date.now() - millis) / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hr ago";
  if (diffHours < 24) return `${diffHours} hrs ago`;

  return new Date(millis).toLocaleDateString();
}
