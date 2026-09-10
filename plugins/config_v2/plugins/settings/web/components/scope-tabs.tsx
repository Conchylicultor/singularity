import { useCallback, useMemo, type ReactNode } from "react";
import { MdAdd } from "react-icons/md";
import { Apps } from "@plugins/apps-core/web";
import { AppIconView } from "@plugins/apps-core/plugins/app-icon/web";
import {
  scopeAppId,
  configV2ScopesResource,
  forkDescriptorScope,
} from "@plugins/config_v2/core";
import type {
  ConfigV2ConflictLocations,
  ConfigV2ScopesMap,
} from "@plugins/config_v2/core";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useScopeDisplay } from "../internal/scope-label";

type AppContribution = ReturnType<typeof Apps.App.useContributions>[number];

export function ScopeTabs({
  storePath,
  scopeId,
  conflict,
  onSelect,
}: {
  storePath: string;
  scopeId: string | undefined;
  /** Where this descriptor conflicts, or undefined for nowhere. */
  conflict: ConfigV2ConflictLocations | undefined;
  onSelect: (scopeId: string | undefined) => void;
}) {
  const apps = Apps.App.useContributions();
  const scopeDisplay = useScopeDisplay();
  // One global scopes-map subscription, `select`ed to this descriptor's list.
  const selectScopes = useCallback(
    (map: ConfigV2ScopesMap) => map[storePath] ?? [],
    [storePath],
  );
  const scopesRes = useResource(
    configV2ScopesResource,
    {},
    { select: selectScopes },
  );
  // `{}` initialData → never pending; gate anyway so the tab bar paints only
  // settled data (no flash of a Base-only bar before known scopes resolve).
  if (scopesRes.pending) return <Loading />;
  const scopes = scopesRes.data;

  return (
    <Stack direction="row" gap="2xs" align="center" wrap>
      <ScopeTab
        label={scopeDisplay(undefined).label}
        scopeId={undefined}
        active={scopeId === undefined}
        hasConflict={conflict?.base ?? false}
        onSelect={onSelect}
      />
      {scopes.map((sid) => {
        const { label, icon } = scopeDisplay(sid);
        return (
          <ScopeTab
            key={sid}
            label={label}
            icon={icon}
            scopeId={sid}
            active={scopeId === sid}
            hasConflict={conflict?.scopeIds.includes(sid) ?? false}
            onSelect={onSelect}
          />
        );
      })}
      <AddScopeButton
        storePath={storePath}
        apps={apps}
        scopes={scopes}
        onSelect={onSelect}
      />
    </Stack>
  );
}

// One tab. Its warning dot comes from the descriptor's slice of the ONE aggregate
// conflict map the nav badge also reads, rather than from a per-tab subscription:
// the tab a badge points at and the badge itself then cannot disagree, and the
// tab strip costs one subscription instead of one per customized app.
function ScopeTab({
  label,
  icon,
  scopeId,
  active,
  hasConflict,
  onSelect,
}: {
  label: string;
  icon?: ReactNode;
  scopeId: string | undefined;
  active: boolean;
  hasConflict: boolean;
  onSelect: (scopeId: string | undefined) => void;
}) {
  return (
    <ToggleChip
      active={active}
      variant="ghost"
      icon={icon}
      onClick={() => onSelect(scopeId)}
    >
      {hasConflict ? (
        // A chip's children sit in the badge's own text span, so the dot needs a
        // row of its own to be spaced from the label. Only the conflicting tab
        // takes it — a plain label keeps ellipsizing the way every other chip's
        // does.
        <Inline as="span" gap="2xs">
          {label}
          <StatusDot colorClass="bg-warning" />
        </Inline>
      ) : (
        label
      )}
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
          {available.map((entry) => {
            const sid = `app:${entry.id}`;
            return (
              <Row
                key={entry.id}
                size="sm"
                hover="muted"
                icon={<AppIconView icon={entry.icon} />}
                onClick={() => {
                  fork({ body: { storePath, scopeId: sid } });
                  onSelect(sid);
                }}
              >
                {entry.app.name}
              </Row>
            );
          })}
        </Stack>
      )}
    </InlinePopover>
  );
}
