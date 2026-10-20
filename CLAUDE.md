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
The extension follows Raycast's AI tools pattern with four main components:

1. **Commands** (`src/*.tsx`) - Raycast commands with UI views
   - `index.tsx` - Usage information command
   - `unblock.tsx` - "Unblock Domain": unblock the domain argument directly, or pick one blocked in the last hour
2. **Tools** (`src/tools/`) - AI-callable functions (no-view mode)
   - `get-query-log.ts` - Fetch DNS query logs
   - `unblock-domain.ts` - Unblock domains with native confirmation
3. **Utils** (`src/utils/`) - Shared utilities
   - `adguard-api.ts` - API client (API key auth)
   - `domain-helpers.ts` - Domain parsing, root extraction, `groupByRoot` (pure, unit tested in `test/`)
   - `user-rules.ts` - The only reader/writer of user rules: `getAllowedDomains`, `allowDomains`, `removeAllowRules`
   - `blocked-domains.ts` - `fetchBlockedDomains(minutes)`: blocked queries, one entry per domain

### API Integration Pattern

The extension uses a centralized API client in `src/utils/adguard-api.ts` that:
- Authenticates with an API key from preferences (`Authorization: ApiKey <key>`)
- Provides typed interfaces for AdGuard DNS API responses
- Exports helper functions: `callAdGuardAPI()`, `buildApiUrl()`, `getDnsServerId()`

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

**AI Tools (no-view mode):**
- **get-query-log.ts** - Fetches DNS query logs, filters for blocked domains, groups by domain, formats results
- **unblock-domain.ts** - Adds whitelist rules using AdGuard DNS syntax (`@@||domain.com^`), shows native `Tool.Confirmation` dialog, automatically defaults to root domains

**Tool.Confirmation Pattern:**
Tools can export a `confirmation` function that shows a native Raycast confirmation dialog before execution:
```typescript
export const confirmation: Tool.Confirmation<Input> = async (input) => {
  return {
    message: "Unblock domains?",
    info: [{ name: "Domain", value: "example.com" }],
    style: Action.Style.Regular,
  };
};
```
This provides better UX than text-based AI confirmation.

### Root Domain Logic

**Critical behavior**: The extension defaults to unblocking root domains instead of subdomains for broader coverage.

- `www.peacocktv.com` → unblocks `peacocktv.com`
- `api-global.netflix.com` → unblocks `netflix.com`
- Handles multi-part TLDs (`.co.uk`, `.com.au`, etc.)

Implementation in `src/utils/domain-helpers.ts`:
- `getRootDomain(domain)` - Extracts root from subdomain
- `parseHostname(input)` - Extracts a hostname from a domain, URL, or AdGuard rule
- `isCoveredByAllowRule(domain, allowed)` - True if the domain or any parent has an allow rule

This logic is used by:
- `unblock-domain` tool - Automatically converts subdomains to roots
- `unblock` command - Groups recently blocked domains by root, allows the root by default
- AI instructions - Presents findings grouped by root

### Two User Flows

**Quick Flow (AI Chat):**
1. User: "Netflix isn't working"
2. AI calls `get-query-log` tool
3. AI analyzes and presents grouped root domains
4. User: "all" or specific domains
5. AI calls `unblock-domain` tool → Native confirmation shows
6. User confirms → Domains unblocked

**Visual Flow (Native UI):**
1. User runs "Unblock Domain", optionally with a domain argument
2. With a domain or URL as the argument, its root is unblocked straight away and the result screen shows.
3. Without one, the Recently Blocked list shows the last hour of blocked queries grouped by root. The search bar
   is also an input: Enter allows the root, Cmd+Enter the exact hostname. Cmd+O opens blocked queries in the
   dashboard.
4. The result screen replaces the list: Done (Enter) closes Raycast, Open User Rules (Cmd+Enter) opens the
   server's user rules page, Undo (Cmd+Z) removes the rule and returns to the search with the domain filled in.
   A domain an allow rule already covers gets "already unblocked" and no Undo. Esc leaves the command.

Both flows use same AdGuard API patterns, same root domain logic, but different UX.

### AI Instructions

The extension's AI behavior is defined in `package.json` under the `ai` field:
- Workflow: fetch logs → analyze → present root domains → offer quick vs visual path
- Emphasizes root domain unblocking by default
- Offers two paths: quick text-based ("all") or visual UI command
- Leverages native `Tool.Confirmation` for safety

## Code Style

- **TypeScript**: Strict mode enabled, no `any` types
- **Prettier**: 120 character line width, semicolons, double quotes, 2-space tabs, trailing commas
- **ESLint**: Uses `@raycast/eslint-config` preset
- **Imports**: Use static imports (not dynamic)

## AdGuard DNS API

### Authentication
The extension requires two credentials configured in Raycast preferences:
- API key (created in AdGuard DNS dashboard → User preferences → API keys; does not expire)
- DNS Server ID (identifies which DNS server to query/modify)

### Key Endpoints
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

## Key Patterns & File References

### API Client Pattern (`src/utils/adguard-api.ts`)
- `callAdGuardAPI(url, options?)` - Makes requests authenticated with the API key
- `buildApiUrl(path)` - Constructs full API URLs
- `getDnsServerId()` - Gets server ID from preferences
- All API calls go through this centralized client

### Domain Parsing (`src/utils/domain-helpers.ts`)
- `getRootDomain(domain)` - Core logic for root extraction (handles `.co.uk` etc)
- `parseHostname(input)` / `isCoveredByAllowRule(domain, allowed)`
- Used by both AI tools and UI commands

### AI Tool with Confirmation (`src/tools/unblock-domain.ts`)
- Default export: Main tool function (returns string for AI)
- Named export: `confirmation` function (shows native dialog)
- Automatically converts input domains to roots before processing
- Confirmation shows what will actually be unblocked (roots + their subdomains)

### View Command (`src/unblock.tsx`)
- Loads `fetchBlockedDomains(60)` and the allow list with `useCachedPromise` (instant reopen, Cmd+R)
- `Screen` union (`search` | `unblocking` | `result`) in one `useState` picks the List, the loading `Detail`, or
  the result `Detail`. A parseable argument starts in `unblocking`; `result` with empty `added` means already unblocked
- Writes go through `allowDomains`, which skips domains an allow rule already covers; Undo calls `removeAllowRules`
  with exactly the domains that were added

## Testing

### Setup
1. Run `npm run dev` to load in Raycast with hot reload
2. Configure credentials in Raycast Settings → Extensions → AdGuard DNS:
   - API Key, DNS Server ID (see README.md for obtaining these)

### Testing AI Tools
Open Raycast AI and use `@adguard-dns` mention:
- "Show me what's been blocked in the last 10 minutes"
- "Netflix isn't working" → Should suggest unblock with "all" option
- "all" → Should show native confirmation dialog with root domains
- Verify confirmation shows root domains (e.g., `netflix.com`, not `www.netflix.com`)

### Unit Tests
`npm test` runs `node --test test/` against the pure helpers in `src/utils/domain-helpers.ts`.

### Testing View Commands
1. Run `Unblock Domain site.metropolis.io` from root search → "Unblocking metropolis.io", then the
   "Unblocked metropolis.io" result screen with the added `@@||metropolis.io^` rule
2. Enter (Done) → Raycast closes; Cmd+Enter (Open User Rules) → the server's user rules page opens
3. Cmd+Z (Undo) → "metropolis.io is blocked again" toast, back to the search with `metropolis.io` filled in
4. Run `Unblock Domain metropolis.io` twice → the second run shows "metropolis.io is already unblocked", no Undo
5. Run `Unblock Domain` with no argument → Recently Blocked list; paste `https://site.metropolis.io/x` → title
   `metropolis.io`, subtitle "from site.metropolis.io"; Enter unblocks with a progress toast
6. Esc on the result screen → leaves the command instead of returning to "Recently Blocked"
7. Cmd+O → blocked queries open in the dashboard; Cmd+R refreshes the list

### Expected Behavior
- AI tools return strings to AI (logged in AI chat)
- View commands show native Raycast UI
- Both paths use root domain logic
- The AI tool confirms before unblocking; "Unblock Domain" acts right away, then offers Undo
