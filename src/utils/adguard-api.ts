import { getPreferenceValues, LocalStorage } from "@raycast/api";

const ADGUARD_API_BASE = "https://api.adguard-dns.io";
const STORAGE_KEY_DEVICE_CACHE = "adguard_device_cache";
const DEVICE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface QueryLogItem {
  domain: string;
  time_iso: string;
  time_millis: number;
  filtering_info?: {
    filtering_status?: string;
    filter_rule?: string;
    filter_id?: string;
  };
  device_id?: string;
  dns_request_type?: string;
}

export interface QueryLogResponse {
  items: QueryLogItem[];
  pages: {
    current: number;
    total: number;
  };
}

export interface DNSServerSettings {
  user_rules_settings: {
    enabled: boolean;
    rules: string[];
    rules_count: number;
  };
}

export interface Device {
  id: string;
  name: string;
  dns_server_id?: string;
}

interface DeviceCache {
  devices: Record<string, string>; // Map of device ID to device name
  timestamp: number;
}

/**
 * Get preferences values
 */
function getPrefs() {
  return getPreferenceValues();
}

/**
 * Makes an authenticated API call using the API key from preferences
 */
export async function callAdGuardAPI(url: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = (getPrefs().adguardApiKey as string | undefined)?.trim();

  if (!apiKey) {
    throw new Error("AdGuard API key is not configured. Please check extension preferences.");
  }

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `ApiKey ${apiKey}`,
    },
  });
}

/**
 * Get the DNS server ID from preferences
 */
export function getDnsServerId(): string {
  const prefs = getPrefs();

  if (!prefs.adguardDnsServerId) {
    throw new Error("AdGuard DNS Server ID is not configured. Please check extension preferences.");
  }

  return prefs.adguardDnsServerId;
}

/**
 * Build AdGuard API URL
 */
export function buildApiUrl(path: string): string {
  return `${ADGUARD_API_BASE}${path}`;
}

/**
 * Fetch devices from AdGuard API with caching
 */
export async function getDeviceMap(): Promise<Record<string, string>> {
  // Try to get from cache first
  const cachedData = await LocalStorage.getItem<string>(STORAGE_KEY_DEVICE_CACHE);

  if (cachedData) {
    try {
      const cache = JSON.parse(cachedData) as DeviceCache;
      const now = Date.now();

      // Check if cache is still valid
      if (now - cache.timestamp < DEVICE_CACHE_DURATION) {
        return cache.devices;
      }
    } catch (error) {
      console.error("Failed to parse device cache:", error);
    }
  }

  // Cache is invalid or doesn't exist, fetch from API
  const url = buildApiUrl("/oapi/v1/devices");
  const response = await callAdGuardAPI(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch devices: ${response.status}`);
  }

  // API returns an array of Device objects
  const devices = (await response.json()) as Device[];

  // Build device map (ID -> name)
  const deviceMap: Record<string, string> = {};
  for (const device of devices) {
    deviceMap[device.id] = device.name;
  }

  // Save to cache
  const cache: DeviceCache = {
    devices: deviceMap,
    timestamp: Date.now(),
  };

  await LocalStorage.setItem(STORAGE_KEY_DEVICE_CACHE, JSON.stringify(cache));

  return deviceMap;
}
