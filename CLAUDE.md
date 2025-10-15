# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Raycast AI extension that helps troubleshoot service issues by analyzing AdGuard DNS query logs and unblocking domains through natural language interaction. The extension provides AI tools that fetch DNS query logs and unblock domains via the AdGuard DNS API.

## Development Commands

### Essential Commands
```bash
# Development mode with hot reload (imports extension to Raycast)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Auto-fix linting issues
npm run fix-lint

# Publish to Raycast Store
npm run publish
```

## Architecture

### Extension Structure
The extension follows Raycast's AI tools pattern with three main components:

1. **index.tsx** - Command that displays usage information in Raycast
2. **Tools** (`src/tools/`) - AI-callable functions exposed to Raycast AI
3. **Utils** (`src/utils/`) - Shared API utilities

### API Integration Pattern

The extension uses a centralized API client in `src/utils/adguard-api.ts` that:
- Manages authentication tokens in-memory during extension lifetime
- Automatically refreshes access tokens when they expire (401 responses)
- Provides typed interfaces for AdGuard DNS API responses
- Exports helper functions: `callAdGuardAPI()`, `buildApiUrl()`, `getDnsServerId()`

**Token refresh flow:**
1. First request uses access token from preferences
2. On 401 response, automatically calls refresh endpoint with refresh token
3. Updates in-memory token and retries request
4. All subsequent requests use the refreshed token

### Tool Implementation

Tools are located in `src/tools/` and follow this pattern:
```typescript
type Input = {
  // Tool parameters with JSDoc descriptions (shown to AI)
};

export default async function tool(input: Input): Promise<string> {
  // Implementation that returns formatted string for AI to read
}
```

**Current Tools:**
- **get-query-log.ts** - Fetches DNS query logs, filters for blocked domains, groups by domain, and formats results with timestamps
- **unblock-domain.ts** - Adds whitelist rules using AdGuard DNS syntax (`@@||domain.com^`), checks for duplicates, and requires user confirmation

### AI Instructions

The extension's AI behavior is defined in `package.json` under the `ai` field:
- Instructs AI on troubleshooting workflow (fetch logs → analyze → suggest → confirm → unblock)
- Emphasizes brevity and directness
- Provides suggested prompts for common issues

## Code Style

- **TypeScript**: Strict mode enabled, no `any` types
- **Prettier**: 120 character line width, semicolons, double quotes, 2-space tabs, trailing commas
- **ESLint**: Uses `@raycast/eslint-config` preset
- **Imports**: Use static imports (not dynamic)

## AdGuard DNS API

### Authentication
The extension requires three credentials configured in Raycast preferences:
- Access token (expires, refreshed automatically)
- Refresh token (long-lived, used to get new access tokens)
- DNS Server ID (identifies which DNS server to query/modify)

### Key Endpoints
- `POST /oapi/v1/oauth_token` - Refresh access token
- `GET /oapi/v1/query_log` - Fetch DNS query logs with time window and limit
- `GET /oapi/v1/dns_servers/{id}` - Get DNS server settings
- `PUT /oapi/v1/dns_servers/{id}/settings` - Update user rules (whitelist/blacklist)

### Query Log Structure
Query logs return items with:
- `domain` - The DNS domain that was queried
- `time_iso` / `time_millis` - When the query occurred
- `filtering_info.filtering_status` - `REQUEST_BLOCKED` or `RESPONSE_BLOCKED` for blocked queries
- `filtering_info.filter_rule` - Which rule blocked the domain

### Whitelist Rule Format
Domains are unblocked using AdGuard DNS syntax: `@@||domain.com^`
- `@@` prefix indicates whitelist (exception) rule
- `||` matches domain and all subdomains
- `^` separator character

## File References

When working with specific functionality:
- Token management and API calls: `src/utils/adguard-api.ts:104` (`callAdGuardAPI` function)
- Token refresh logic: `src/utils/adguard-api.ts:69` (`refreshAccessToken` function)
- Query log fetching: `src/tools/get-query-log.ts:15` (main tool function)
- Domain unblocking: `src/tools/unblock-domain.ts:15` (main tool function)
- AI instructions: `package.json:63` (`ai` field)

## Testing

To test the extension:
1. Run `npm run dev` to load in Raycast
2. Configure credentials in Raycast Settings → Extensions → AdGuard DNS
3. Open Raycast AI and use `@adguard-dns` mention with test prompts:
   - "Show me what's been blocked in the last 10 minutes"
   - "Netflix isn't working"
   - "Unblock example.com"

The AI should fetch logs, analyze blocked domains, and request confirmation before unblocking.
