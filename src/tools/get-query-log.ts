import { buildApiUrl, callAdGuardAPI, QueryLogResponse } from "../utils/adguard-api";

type Input = {
  /** Number of minutes to look back (default: 10). Use larger values like 30 or 60 if no relevant blocks are found. */
  minutes?: number;
};

/**
 * Fetches recent DNS query logs from AdGuard DNS to identify blocked domains.
 *
 * This tool retrieves up to 200 DNS query log entries within the specified time window
 * and filters for domains that were blocked. It's useful for troubleshooting service
 * issues by identifying which domains are being blocked by DNS filtering.
 */
export default async function tool(input: Input): Promise<string> {
  try {
    const minutes = input.minutes || 10;
    const now = Date.now();
    const timeFromMillis = now - minutes * 60 * 1000;
    const timeToMillis = now;

    const url = buildApiUrl(
      `/oapi/v1/query_log?time_from_millis=${timeFromMillis}&time_to_millis=${timeToMillis}&limit=200`,
    );

    const response = await callAdGuardAPI(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AdGuard API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as QueryLogResponse;

    // Filter for blocked domains
    const blockedDomains = data.items
      .filter(
        (item) =>
          item.filtering_info?.filtering_status === "REQUEST_BLOCKED" ||
          item.filtering_info?.filtering_status === "RESPONSE_BLOCKED",
      )
      .map((item) => ({
        domain: item.domain,
        blocked_at: item.time_iso,
        filter_rule: item.filtering_info?.filter_rule,
        filter_id: item.filtering_info?.filter_id,
      }));

    // Format output for AI to understand
    if (blockedDomains.length === 0) {
      return `No blocked domains found in the last ${minutes} minutes (searched ${data.items.length} total queries).

Suggestion: Try expanding the time window by using a larger 'minutes' parameter (e.g., 30 or 60 minutes).`;
    }

    // Build detailed report
    let result = `Found ${blockedDomains.length} blocked domain(s) in the last ${minutes} minutes:\n\n`;

    // Group by domain to show unique domains
    const uniqueDomains = new Map<string, { count: number; lastSeen: string; rule?: string }>();

    for (const blocked of blockedDomains) {
      const existing = uniqueDomains.get(blocked.domain);
      if (existing) {
        existing.count++;
        // Keep the most recent timestamp
        if (new Date(blocked.blocked_at) > new Date(existing.lastSeen)) {
          existing.lastSeen = blocked.blocked_at;
          existing.rule = blocked.filter_rule;
        }
      } else {
        uniqueDomains.set(blocked.domain, {
          count: 1,
          lastSeen: blocked.blocked_at,
          rule: blocked.filter_rule,
        });
      }
    }

    // Sort by most recent
    const sortedDomains = Array.from(uniqueDomains.entries()).sort((a, b) => {
      return new Date(b[1].lastSeen).getTime() - new Date(a[1].lastSeen).getTime();
    });

    for (const [domain, info] of sortedDomains) {
      const timeAgo = getTimeAgo(info.lastSeen);
      result += `- ${domain}\n`;
      result += `  Blocked: ${timeAgo}\n`;
      if (info.count > 1) {
        result += `  Attempts: ${info.count}\n`;
      }
      if (info.rule) {
        result += `  Rule: ${info.rule}\n`;
      }
      result += `\n`;
    }

    result += `\nTotal queries scanned: ${data.items.length}\n`;
    result += `Time window: Last ${minutes} minutes`;

    return result;
  } catch (error) {
    if (error instanceof Error) {
      return `Error fetching query logs: ${error.message}`;
    }
    return `Error fetching query logs: ${String(error)}`;
  }
}

/**
 * Convert ISO timestamp to human-readable "time ago" format
 */
function getTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  return date.toLocaleString();
}
