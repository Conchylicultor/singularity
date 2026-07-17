import { useCallback, useMemo, type ReactNode } from "react";
import { MdAdd, MdLayers } from "react-icons/md";
import { Apps } from "@plugins/apps-core/web";
import { AppIconView } from "@plugins/apps-core/plugins/app-icon/web";
import { scopeAppId, configV2ScopesResource, configV2ConflictResource, forkDescriptorScope } from "@plugins/config_v2/core";
import type { ConfigV2ScopesMap } from "@plugins/config_v2/core";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

type AppContribution = ReturnType<typeof Apps.App.useContributions>[number];

// Resolves an `app:<id>` scopeId to its app's display label + icon (falls back
// to the raw id when no app matches — e.g. a committed scope for an app that
// isn't installed in this build).
function resolveScope(scopeId: string, apps: AppContribution[]): {
  label: string;
  icon: ReactNode;
} {
  const rawId = scopeAppId(scopeId);
  const app = apps.find((a) => a.id === rawId);
  if (app) return { label: app.tooltip, icon: <AppIconView icon={app.icon} /> };
  return { label: rawId ?? scopeId, icon: <MdLayers /> };
}

export function ScopeTabs({
  storePath,
  scopeId,
  onSelect,
}: {
  storePath: string;
  scopeId: string | undefined;
  onSelect: (scopeId: string | undefined) => void;
}) {
  const apps = Apps.App.useContributions();
  // One global scopes-map subscription, `select`ed to this descriptor's list.
  const selectScopes = useCallback(
    (map: ConfigV2ScopesMap) => map[storePath] ?? [],
    [storePath],
  );
  const scopesRes = useResource(configV2ScopesResource, {}, { select: selectScopes });
  // `{}` initialData → never pending; gate anyway so the tab bar paints only
  // settled data (no flash of a Base-only bar before known scopes resolve).
  if (scopesRes.pending) return <Loading />;
  const scopes = scopesRes.data;

  return (
    <Stack direction="row" gap="2xs" align="center" wrap>
      <ScopeTab
        label="Base"
        scopeId={undefined}
        storePath={storePath}
        active={scopeId === undefined}
        onSelect={onSelect}
      />
      {scopes.map((sid) => {
        const { label, icon } = resolveScope(sid, apps);
        return (
          <ScopeTab
            key={sid}
            label={label}
            icon={icon}
            scopeId={sid}
            storePath={storePath}
            active={scopeId === sid}
            onSelect={onSelect}
          />
        );
      })}
      <AddScopeButton storePath={storePath} apps={apps} scopes={scopes} onSelect={onSelect} />
    </Stack>
  );
}

// One tab. Subscribes this descriptor's per-path conflict for the tab's scope so
// it can show a warning dot when THIS descriptor is in conflict for that scope. N
// is small (one sub per customized app), so per-tab subscriptions are fine.
function ScopeTab({
  label,
  icon,
  scopeId,
  storePath,
  active,
  onSelect,
}: {
  label: string;
  icon?: React.ReactNode;
  scopeId: string | undefined;
  storePath: string;
  active: boolean;
  onSelect: (scopeId: string | undefined) => void;
}) {
  const conflictRes = useResource(configV2ConflictResource, { path: storePath, ...(scopeId ? { scopeId } : {}) });
  const hasConflict = !conflictRes.pending && conflictRes.data !== null;

  return (
    <ToggleChip
      active={active}
      variant="ghost"
      icon={icon}
      onClick={() => onSelect(scopeId)}
    >
      {label}
      {hasConflict && <StatusDot colorClass="bg-warning" />}
    </ToggleChip>
  );
}

// `+` add-app: lists apps not yet customized for this descriptor; selecting one
// forks a new per-descriptor scope then selects its tab (the scopes resource
// live-updates to include it).
function AddScopeButton({
  storePath,
  apps,
  scopes,
  onSelect,
}: {
  storePath: string;
  apps: AppContribution[];
  scopes: string[];
  onSelect: (scopeId: string | undefined) => void;
}) {
  const { mutate: fork } = useEndpointMutation(forkDescriptorScope);

  const available = useMemo(() => {
    const taken = new Set(scopes.map((sid) => scopeAppId(sid)));
    return apps.filter((a) => !taken.has(a.id));
  }, [apps, scopes]);

  return (
    <InlinePopover
      tooltip="Customize for an app"
      width="sm"
      padding="2xs"
      trigger={
        <ToggleChip active={false} variant="ghost" icon={<MdAdd />}>
          App
        </ToggleChip>
      }
    >
      {available.length === 0 ? (
        <Placeholder>All apps customized</Placeholder>
      ) : (
        <Stack gap="2xs">
          {/* eslint-disable-next-line data-view/no-adhoc-row-list -- add-app-scope picker (transient chrome) */}
          {available.map((app) => {
            const sid = `app:${app.id}`;
            return (
              <Row
                key={app.id}
                size="sm"
                hover="muted"
                icon={<AppIconView icon={app.icon} />}
                onClick={() => {
                  fork({ body: { storePath, scopeId: sid } });
                  onSelect(sid);
                }}
              >
                {app.tooltip}
              </Row>
            );
          })}
        </Stack>
      )}
    </InlinePopover>
  );
}
