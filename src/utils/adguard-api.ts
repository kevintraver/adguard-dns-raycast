import { getPreferenceValues } from "@raycast/api";

const ADGUARD_API_BASE = "https://api.adguard-dns.io";

interface Preferences {
  adguardApiToken: string;
  adguardRefreshToken: string;
  adguardDnsServerId: string;
}

// In-memory token storage (persists for extension lifetime)
let currentAccessToken: string | null = null;

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

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

/**
 * Get preferences values
 */
function getPrefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

/**
 * Initialize access token from preferences
 */
function initializeToken(): string {
  if (!currentAccessToken) {
    const prefs = getPrefs();
    currentAccessToken = prefs.adguardApiToken;
  }
  return currentAccessToken;
}

/**
 * Refreshes the access token using the refresh token
 */
async function refreshAccessToken(): Promise<string> {
  const prefs = getPrefs();

  if (!prefs.adguardRefreshToken) {
    throw new Error("AdGuard refresh token is not configured. Please check extension preferences.");
  }

  const response = await fetch(`${ADGUARD_API_BASE}/oapi/v1/oauth_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `refresh_token=${encodeURIComponent(prefs.adguardRefreshToken)}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;

  // Update in-memory token
  currentAccessToken = data.access_token;

  console.log("AdGuard API token refreshed successfully");

  return data.access_token;
}

/**
 * Makes an API call with automatic token refresh on 401
 */
export async function callAdGuardAPI(url: string, options: RequestInit = {}): Promise<Response> {
  const token = initializeToken();

  if (!token) {
    throw new Error("AdGuard API token is not configured. Please check extension preferences.");
  }

  // Add authorization header
  const requestOptions: RequestInit = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  };

  // Try the request
  let response = await fetch(url, requestOptions);

  // If unauthorized, refresh token and retry once
  if (response.status === 401) {
    console.log("Token expired, refreshing...");

    const newToken = await refreshAccessToken();

    // Retry with new token
    requestOptions.headers = {
      ...requestOptions.headers,
      Authorization: `Bearer ${newToken}`,
    };

    response = await fetch(url, requestOptions);
  }

  return response;
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
