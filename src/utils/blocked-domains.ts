import { buildApiUrl, callAdGuardAPI, getDeviceMap, type QueryLogResponse } from "./adguard-api";
import { type BlockedDomain, getRootDomain } from "./domain-helpers";

type Accumulator = {
  attempts: number;
  lastSeen: number;
  devices: Set<string>;
  rules: Set<string>;
};

/** Blocked queries from the last `minutes`, one entry per domain, most recently seen first. */
export async function fetchBlockedDomains(minutes: number): Promise<BlockedDomain[]> {
  const now = Date.now();
  const params = new URLSearchParams({
    time_from_millis: String(now - minutes * 60 * 1000),
    time_to_millis: String(now),
    limit: "1000",
  });
  params.append("statuses", "REQUEST_BLOCKED");
  params.append("statuses", "RESPONSE_BLOCKED");

  const [response, deviceMap] = await Promise.all([
    callAdGuardAPI(buildApiUrl(`/oapi/v1/query_log?${params}`)),
    getDeviceMap(),
  ]);
  if (!response.ok) {
    throw new Error(`Failed to fetch query log: ${response.status} ${await response.text()}`);
  }
  const { items } = (await response.json()) as QueryLogResponse;

  const domains = new Map<string, Accumulator>();
  for (const item of items) {
    let entry = domains.get(item.domain);
    if (!entry) {
      entry = { attempts: 0, lastSeen: 0, devices: new Set(), rules: new Set() };
      domains.set(item.domain, entry);
    }
    entry.attempts++;
    entry.lastSeen = Math.max(entry.lastSeen, item.time_millis);
    if (item.device_id) entry.devices.add(deviceMap[item.device_id] ?? item.device_id);
    if (item.filtering_info?.filter_rule) entry.rules.add(item.filtering_info.filter_rule);
  }

  return Array.from(domains, ([domain, entry]) => ({
    domain,
    root: getRootDomain(domain),
    attempts: entry.attempts,
    lastSeen: entry.lastSeen,
    devices: [...entry.devices],
    rules: [...entry.rules],
  })).sort((a, b) => b.lastSeen - a.lastSeen);
}
