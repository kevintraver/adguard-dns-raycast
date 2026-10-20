import { buildApiUrl, callAdGuardAPI, getDeviceMap, type QueryLogResponse } from "./adguard-api";
import { getRootDomain } from "./domain-helpers";

export type BlockedGroup = {
  root: string;
  attempts: number;
  lastSeen: number;
  subdomains: { domain: string; attempts: number }[];
  devices: string[];
  rules: string[];
};

type Accumulator = {
  attempts: number;
  lastSeen: number;
  subdomains: Map<string, number>;
  devices: Set<string>;
  rules: Set<string>;
};

/** Blocked queries from the last `minutes`, grouped by root domain, most recently seen first. */
export async function fetchBlockedGroups(minutes: number): Promise<BlockedGroup[]> {
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

  const groups = new Map<string, Accumulator>();
  for (const item of items) {
    const root = getRootDomain(item.domain);
    let group = groups.get(root);
    if (!group) {
      group = { attempts: 0, lastSeen: 0, subdomains: new Map(), devices: new Set(), rules: new Set() };
      groups.set(root, group);
    }
    group.attempts++;
    group.lastSeen = Math.max(group.lastSeen, item.time_millis);
    group.subdomains.set(item.domain, (group.subdomains.get(item.domain) ?? 0) + 1);
    if (item.device_id) group.devices.add(deviceMap[item.device_id] ?? item.device_id);
    if (item.filtering_info?.filter_rule) group.rules.add(item.filtering_info.filter_rule);
  }

  return Array.from(groups, ([root, group]) => ({
    root,
    attempts: group.attempts,
    lastSeen: group.lastSeen,
    subdomains: Array.from(group.subdomains, ([domain, attempts]) => ({ domain, attempts })).sort(
      (a, b) => b.attempts - a.attempts,
    ),
    devices: [...group.devices],
    rules: [...group.rules],
  })).sort((a, b) => b.lastSeen - a.lastSeen);
}
