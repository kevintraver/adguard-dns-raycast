import { Action, ActionPanel, Color, Icon, LaunchProps, List, showToast, Toast } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { type BlockedGroup, fetchBlockedGroups } from "./utils/blocked-domains";
import { getRootDomain, isCoveredByAllowRule, parseHostname } from "./utils/domain-helpers";
import { allowDomains, getAllowedDomains, removeAllowRules } from "./utils/user-rules";

const RECENT_MINUTES = 60;

// useCachedPromise persists its data as JSON, which would turn a Set into {}.
async function listAllowedDomains(): Promise<string[]> {
  return [...(await getAllowedDomains())];
}

function showAlreadyAllowed(domain: string) {
  return showToast({ style: Toast.Style.Success, title: `${domain} is already allowed` });
}

function describeSubdomains(group: BlockedGroup): string | undefined {
  const others = group.subdomains.map(({ domain }) => domain).filter((domain) => domain !== group.root);
  if (others.length === 0) return undefined;
  return others.slice(0, 2).join(", ") + (others.length > 2 ? ` +${others.length - 2}` : "");
}

export default function Unblock(props: LaunchProps<{ arguments: Arguments.Unblock }>) {
  // The generated type says string, but deeplinks and launchCommand can omit an optional argument.
  const [searchText, setSearchText] = useState(props.arguments.domain ?? "");
  const blocked = useCachedPromise(fetchBlockedGroups, [RECENT_MINUTES]);
  const allowedList = useCachedPromise(listAllowedDomains);
  const allowed = useMemo(() => new Set(allowedList.data), [allowedList.data]);

  const hostname = parseHostname(searchText);
  const root = hostname && getRootDomain(hostname);
  const hostnameAllowed = hostname !== undefined && isCoveredByAllowRule(hostname, allowed);
  const needle = hostname ?? searchText.trim().toLowerCase();
  const groups = (blocked.data ?? []).filter(
    (group) =>
      !group.subdomains.every(({ domain }) => isCoveredByAllowRule(domain, allowed)) &&
      (group.root.includes(needle) || group.subdomains.some(({ domain }) => domain.includes(needle))),
  );

  function refresh() {
    blocked.revalidate();
    allowedList.revalidate();
  }

  async function allow(domain: string) {
    if (isCoveredByAllowRule(domain, allowed)) {
      await showAlreadyAllowed(domain);
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: `Allowing ${domain}` });
    const write = allowDomains([domain]);
    try {
      await allowedList.mutate(write, { optimisticUpdate: (current) => [...(current ?? []), domain] });
    } catch (error) {
      await showFailureToast(error, { title: `Could not allow ${domain}` });
      return;
    }

    const { added } = await write;
    if (added.length === 0) {
      await showAlreadyAllowed(domain);
      return;
    }
    toast.style = Toast.Style.Success;
    toast.title = `Allowed ${domain}`;
    toast.primaryAction = { title: "Undo", onAction: () => undo(added) };
    setSearchText("");
  }

  async function undo(domains: string[]) {
    const label = domains.join(", ");
    const toast = await showToast({ style: Toast.Style.Animated, title: `Removing allow rule for ${label}` });
    try {
      await allowedList.mutate(removeAllowRules(domains), {
        optimisticUpdate: (current) => (current ?? []).filter((domain) => !domains.includes(domain)),
      });
    } catch (error) {
      await showFailureToast(error, { title: `Could not undo allowing ${label}` });
      return;
    }
    toast.style = Toast.Style.Success;
    toast.title = `Removed allow rule for ${label}`;
  }

  const refreshAction = (
    <ActionPanel.Section>
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
      actions={<ActionPanel>{refreshAction}</ActionPanel>}
    >
      {!isLoading && searchText.trim() === "" && (
        <List.EmptyView
          icon={Icon.CheckCircle}
          title="Nothing blocked in the last hour"
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
            accessories={hostnameAllowed ? [{ tag: { value: "Allowed", color: Color.Green } }] : undefined}
            actions={
              <ActionPanel>
                <Action
                  title={`Allow ${root}`}
                  icon={Icon.CheckCircle}
                  onAction={() => (hostnameAllowed ? showAlreadyAllowed(hostname) : allow(root))}
                />
                {hostname !== root && (
                  <Action title={`Allow Only ${hostname}`} icon={Icon.Checkmark} onAction={() => allow(hostname)} />
                )}
                {refreshAction}
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      <List.Section title="Recently Blocked">
        {groups.map((group) => {
          const onlySubdomain =
            group.subdomains.length === 1 && group.subdomains[0].domain !== group.root
              ? group.subdomains[0].domain
              : undefined;
          return (
            <List.Item
              key={group.root}
              icon={{ source: Icon.XMarkCircle, tintColor: Color.Red }}
              title={group.root}
              subtitle={describeSubdomains(group)}
              accessories={[
                ...group.devices.map((device) => ({ tag: device })),
                { text: `${group.attempts} attempt${group.attempts !== 1 ? "s" : ""}` },
                { date: new Date(group.lastSeen) },
              ]}
              actions={
                <ActionPanel>
                  <Action title={`Allow ${group.root}`} icon={Icon.CheckCircle} onAction={() => allow(group.root)} />
                  {onlySubdomain && (
                    <Action
                      title={`Allow Only ${onlySubdomain}`}
                      icon={Icon.Checkmark}
                      onAction={() => allow(onlySubdomain)}
                    />
                  )}
                  {refreshAction}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
