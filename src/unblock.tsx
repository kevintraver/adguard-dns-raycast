import {
  Action,
  ActionPanel,
  closeMainWindow,
  Color,
  Detail,
  Icon,
  LaunchProps,
  List,
  open,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { getDnsServerId } from "./utils/adguard-api";
import { fetchBlockedDomains } from "./utils/blocked-domains";
import { getRootDomain, isCoveredByAllowRule, parseHostname } from "./utils/domain-helpers";
import { allowDomains, getAllowedDomains, removeAllowRules } from "./utils/user-rules";

const BLOCKED_QUERIES_URL =
  "https://adguard-dns.io/en/dashboard/statistics/query?limit=20&statuses%5B0%5D=REQUEST_BLOCKED&statuses%5B1%5D=RESPONSE_BLOCKED";
const MAX_TITLE_LENGTH = 50;
const TIME_WINDOWS = [
  { minutes: 1, label: "1 minute" },
  { minutes: 5, label: "5 minutes" },
  { minutes: 10, label: "10 minutes" },
  { minutes: 60, label: "hour" },
];

type Screen =
  | { kind: "search" }
  | { kind: "unblocking"; domain: string }
  | { kind: "result"; domain: string; added: string[] };

function userRulesUrl(): string {
  return `https://adguard-dns.io/en/dashboard/settings/userrules?server_id=${encodeURIComponent(getDnsServerId())}`;
}

function initialScreen(argument: string): Screen {
  const hostname = parseHostname(argument);
  return hostname ? { kind: "unblocking", domain: getRootDomain(hostname) } : { kind: "search" };
}

// useCachedPromise persists its data as JSON, which would turn a Set into {}.
async function listAllowedDomains(): Promise<string[]> {
  return [...(await getAllowedDomains())];
}

export default function Command(props: LaunchProps<{ arguments: Arguments.Unblock }>) {
  return <UnblockDomain domain={props.arguments.domain} />;
}

export function UnblockDomain({ domain }: { domain?: string }) {
  // Unblock Domain's generated argument type says string, but deeplinks and launchCommand can omit it.
  const argument = domain ?? "";
  const [searchText, setSearchText] = useState(argument);
  const [screen, setScreen] = useState<Screen>(() => initialScreen(argument));
  const [timeWindow, setTimeWindow] = useState(TIME_WINDOWS[0]);
  const blocked = useCachedPromise(fetchBlockedDomains, [timeWindow.minutes]);
  const allowedList = useCachedPromise(listAllowedDomains);
  const allowed = useMemo(() => new Set(allowedList.data), [allowedList.data]);

  const hostname = parseHostname(searchText);
  const root = hostname && getRootDomain(hostname);
  const hostnameAllowed = hostname !== undefined && isCoveredByAllowRule(hostname, allowed);
  const needle = hostname ?? searchText.trim().toLowerCase();
  const rows = (blocked.data ?? []).filter(
    (row) => !isCoveredByAllowRule(row.domain, allowed) && row.domain.includes(needle),
  );

  function refresh() {
    blocked.revalidate();
    allowedList.revalidate();
  }

  async function unblock(domain: string, toast?: Toast) {
    const write = allowDomains([domain]);
    try {
      await allowedList.mutate(write, { optimisticUpdate: (current) => [...(current ?? []), domain] });
    } catch (error) {
      await showFailureToast(error, { title: `Could not unblock ${domain}` });
      setSearchText(domain);
      setScreen({ kind: "search" });
      return;
    }

    const { added } = await write;
    await toast?.hide();
    setScreen({ kind: "result", domain, added });
  }

  async function allow(domain: string) {
    await unblock(domain, await showToast({ style: Toast.Style.Animated, title: `Unblocking ${domain}` }));
  }

  useEffect(() => {
    if (screen.kind === "unblocking") unblock(screen.domain);
  }, []);

  async function undo(domain: string, added: string[]) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Blocking ${domain} again` });
    try {
      await allowedList.mutate(removeAllowRules(added), {
        optimisticUpdate: (current) => (current ?? []).filter((allowedDomain) => !added.includes(allowedDomain)),
      });
    } catch (error) {
      await showFailureToast(error, { title: `Could not undo unblocking ${domain}` });
      return;
    }
    toast.style = Toast.Style.Success;
    toast.title = `${domain} is blocked again`;
    setSearchText(domain);
    setScreen({ kind: "search" });
  }

  async function done() {
    await closeMainWindow({ clearRootSearch: true });
    await popToRoot();
  }

  if (screen.kind === "unblocking") {
    return <Detail isLoading markdown={`# Unblocking ${screen.domain}`} />;
  }

  if (screen.kind === "result") {
    const { domain, added } = screen;
    const alreadyUnblocked = added.length === 0;
    return (
      <Detail
        navigationTitle="Unblocked"
        markdown={
          alreadyUnblocked
            ? `# ${domain} is already unblocked\n\nAn allow rule already covers it in your user rules.`
            : `# Unblocked ${domain}\n\nAdded \`@@||${domain}^\` to your user rules. Devices can take a minute to pick it up because they cache DNS.`
        }
        actions={
          <ActionPanel>
            <Action title="Done" icon={Icon.Check} onAction={done} />
            <Action title="Open User Rules" icon={Icon.Globe} onAction={() => open(userRulesUrl())} />
            {!alreadyUnblocked && (
              <Action
                title="Undo"
                icon={Icon.ArrowCounterClockwise}
                shortcut={{ modifiers: ["cmd"], key: "z" }}
                onAction={() => undo(domain, added)}
              />
            )}
          </ActionPanel>
        }
      />
    );
  }

  const listActions = (
    <ActionPanel.Section>
      <Action
        title="Open Blocked Queries in Browser"
        icon={Icon.Globe}
        shortcut={{ modifiers: ["cmd"], key: "o" }}
        onAction={async () => {
          await closeMainWindow();
          await open(BLOCKED_QUERIES_URL);
        }}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={refresh}
      />
    </ActionPanel.Section>
  );
  const isLoading = blocked.isLoading || allowedList.isLoading;

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Domain or URL to unblock"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Time Window"
          storeValue
          defaultValue={String(TIME_WINDOWS[0].minutes)}
          onChange={(value) =>
            setTimeWindow(TIME_WINDOWS.find(({ minutes }) => String(minutes) === value) ?? TIME_WINDOWS[0])
          }
        >
          {TIME_WINDOWS.map(({ minutes, label }) => (
            <List.Dropdown.Item key={minutes} title={`Last ${label}`} value={String(minutes)} />
          ))}
        </List.Dropdown>
      }
      actions={<ActionPanel>{listActions}</ActionPanel>}
    >
      {!isLoading && searchText.trim() === "" && (
        <List.EmptyView
          icon={Icon.CheckCircle}
          title={`Nothing blocked in the last ${timeWindow.label}`}
          description="Type a domain or paste a URL to unblock it."
        />
      )}
      {!isLoading && searchText.trim() !== "" && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No blocked domains match"
          description="Type a full domain like example.com to unblock it."
        />
      )}
      {hostname && root && (
        <List.Section title="Unblock">
          <List.Item
            icon={Icon.LockUnlocked}
            title={root}
            subtitle={hostname !== root ? `from ${hostname}` : undefined}
            accessories={hostnameAllowed ? [{ tag: { value: "Unblocked", color: Color.Green } }] : undefined}
            actions={
              <ActionPanel>
                <Action title={`Unblock ${root}`} icon={Icon.CheckCircle} onAction={() => allow(root)} />
                {hostname !== root && (
                  <Action title={`Unblock Only ${hostname}`} icon={Icon.Checkmark} onAction={() => allow(hostname)} />
                )}
                {listActions}
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section title="Recently Blocked">
        {rows.map((row) => (
          <List.Item
            key={row.domain}
            icon={{ source: Icon.XMarkCircle, tintColor: Color.Red }}
            title={{
              value:
                row.domain.length > MAX_TITLE_LENGTH ? row.domain.substring(0, MAX_TITLE_LENGTH) + "..." : row.domain,
              tooltip: row.domain.length > MAX_TITLE_LENGTH ? row.domain : undefined,
            }}
            accessories={[
              { text: row.root, tooltip: `Root Domain: ${row.root}` },
              ...row.devices.map((device) => ({ tag: device })),
              { text: `${row.attempts} attempt${row.attempts !== 1 ? "s" : ""}` },
              { date: new Date(row.lastSeen) },
            ]}
            actions={
              <ActionPanel>
                {row.domain !== row.root && (
                  <Action
                    title={`Unblock Root (${row.root})`}
                    icon={Icon.CheckCircle}
                    onAction={() => allow(row.root)}
                  />
                )}
                <Action title={`Unblock ${row.domain}`} icon={Icon.Checkmark} onAction={() => allow(row.domain)} />
                {listActions}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
