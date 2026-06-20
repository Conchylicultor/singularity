import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, useCallback, useState, useEffect } from "react";
import { MdWarning, MdCode, MdTune, MdUndo, MdDifference, MdMerge, MdLayersClear } from "react-icons/md";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useCombinedResources, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { configV2Resource, removeDescriptorScope } from "@plugins/config_v2/core";
import type { ConfigV2ConflictEntry, ConfigV2Tiers, ConfigV2Values } from "@plugins/config_v2/core";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { acknowledgeConflict, deleteOverride, mergeConflict, getConfigRawFile } from "../../core";
import { configDetailPane } from "../internal/panes";
import { useConflict } from "../internal/use-conflicts";
import { useTiers } from "../internal/use-tiers";
import { ConfigFieldRow } from "./config-field-row";
import { ConflictDiff } from "./conflict-diff";
import { InvalidDiff } from "./invalid-diff";
import { ScopeTabs } from "./scope-tabs";

// Walks a structured zod issue path (["items", 6]) into the stored document to
// recover the offending value, so the invalid banner can show exactly what's
// wrong. Returns MISSING when the path doesn't resolve (e.g. a required-but-absent
// key), which renders as "(value missing)" rather than a misleading `undefined`.
const MISSING = Symbol("missing");
function drillPath(root: unknown, path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object") return MISSING;
    cur = (cur as Record<string | number, unknown>)[seg];
    if (cur === undefined) return MISSING;
  }
  return cur;
}

export function ConfigDetail() {
  const configPath = configDetailPane.useRouteEntry()?.params.configPath;
  const registrations = useConfigRegistrations();

  const registration = registrations.find(
    (r) => encodeURIComponent(r.storePath) === configPath,
  );

  if (!registration) {
    return <Placeholder>Config not found</Placeholder>;
  }

  return <ConfigDetailInner registration={registration} />;
}

// All-or-nothing gate over values + conflicts + tiers — none is boot-hydrated
// for an arbitrary scope, so all render pending on first paint. Gating the whole
// body avoids a flash of wrong tier badges or a transiently-absent conflict
// banner. The selected scope (undefined = Base) is local state owned here, above
// the gate, so a tab switch re-keys every read and re-gates atomically. We read
// values directly via the resource (not useConfig) so the body always reflects
// the SELECTED scope — useConfig's base-oriented gating (forked || committed)
// wouldn't fire for a fresh per-descriptor scope.
function ConfigDetailInner({
  registration,
}: {
  registration: ReturnType<typeof useConfigRegistrations>[number];
}) {
  const [scopeId, setScopeId] = useState<string | undefined>(undefined);

  // Reset to Base whenever a different descriptor opens in the pane.
  useEffect(() => {
    setScopeId(undefined);
  }, [registration.storePath]);

  const valuesRes = useResource(configV2Resource, {
    path: registration.storePath,
    ...(scopeId ? { scopeId } : {}),
  });
  const conflictRes = useConflict(registration.storePath, scopeId);
  const tiersRes = useTiers(registration.storePath, scopeId);
  const gated = useCombinedResources({
    values: valuesRes,
    conflict: conflictRes,
    tiers: tiersRes,
  });

  return (
    <Stack gap="xs" className="p-md">
      <ScopeTabs storePath={registration.storePath} scopeId={scopeId} onSelect={setScopeId} />
      {gated.pending ? (
        <Loading />
      ) : (
        <ConfigDetailBody
          registration={registration}
          scopeId={scopeId}
          onSelectScope={setScopeId}
          values={gated.data.values}
          conflict={gated.data.conflict}
          tiers={gated.data.tiers}
        />
      )}
    </Stack>
  );
}

function ConfigDetailBody({
  registration,
  scopeId,
  onSelectScope,
  values,
  conflict,
  tiers,
}: {
  registration: ReturnType<typeof useConfigRegistrations>[number];
  scopeId: string | undefined;
  onSelectScope: (scopeId: string | undefined) => void;
  values: ConfigV2Values;
  conflict: ConfigV2ConflictEntry | null;
  tiers: ConfigV2Tiers;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const defaults = registration.descriptor.defaults as Record<string, unknown>;
  const conflictEntry = conflict;

  // Re-collapse transient UI when the descriptor OR the selected scope changes —
  // a fresh scope is a fresh editing context.
  useEffect(() => {
    setConfirmReset(false);
    setShowDiff(false);
  }, [registration.storePath, scopeId]);

  // During a conflict the app resolves config to the origin (origin takes
  // precedence until reconciled), so `useConfig` returns the origin values.
  // The editor must instead surface the user's override document so they can
  // see and fix what they configured. Fall back to the resolved value for keys
  // absent from a partial override.
  const valueFor = useCallback(
    (key: string): unknown => {
      // Only a hash conflict resolves the app to origin while the editor shows
      // the override. An "invalid" conflict resolves to defaults (= `values`)
      // and its override holds unparseable data, so bind fields to `values`.
      if (conflictEntry?.kind === "hash") {
        const override = conflictEntry.overrideValues;
        if (override && key in override) return override[key];
      }
      return values[key];
    },
    [conflictEntry, values],
  );

  const isSoftConflict = useMemo(() => {
    if (!conflictEntry) return false;
    for (const key of Object.keys(registration.descriptor.fields)) {
      if (JSON.stringify(valueFor(key)) !== JSON.stringify(conflictEntry.originValues[key])) {
        return false;
      }
    }
    return true;
  }, [conflictEntry, valueFor, registration.descriptor.fields]);

  const hasAnyModified = useMemo(() => {
    for (const key of Object.keys(registration.descriptor.fields)) {
      if (JSON.stringify(valueFor(key)) !== JSON.stringify(defaults[key])) return true;
    }
    return false;
  }, [valueFor, defaults, registration.descriptor.fields]);

  // useEndpointMutation (not void fetchEndpoint) so a failed reset/dismiss
  // surfaces via the global error toast instead of escaping as an unhandled
  // rejection. The config view refreshes via its live-state resource on success.
  // Every reconcile body carries the selected `scopeId` (undefined = Base) so it
  // targets the scope the user is editing.
  const { mutate: acknowledge } = useEndpointMutation(acknowledgeConflict);
  const { mutate: resetOverride } = useEndpointMutation(deleteOverride);
  const { mutate: merge } = useEndpointMutation(mergeConflict);
  const { mutate: removeScope } = useEndpointMutation(removeDescriptorScope);

  const handleDismiss = useCallback(() => {
    acknowledge({ body: { storePath: registration.storePath, scopeId } });
  }, [acknowledge, registration.storePath, scopeId]);

  const handleAcceptAll = useCallback(() => {
    resetOverride({ body: { storePath: registration.storePath, scopeId } });
  }, [resetOverride, registration.storePath, scopeId]);

  const handleMerge = useCallback(() => {
    merge({ body: { storePath: registration.storePath, scopeId } });
  }, [merge, registration.storePath, scopeId]);

  // A three-way merge is offered only when propagate captured an ancestor
  // snapshot (trueConflictKeys present). Its length is the count of fields the
  // user and upstream both changed differently — the ones needing attention.
  const trueConflictKeys =
    conflictEntry?.kind === "hash" ? conflictEntry.trueConflictKeys : undefined;
  const canMerge = trueConflictKeys !== undefined;

  const handleResetAll = useCallback(() => {
    resetOverride({ body: { storePath: registration.storePath, scopeId } });
    setConfirmReset(false);
  }, [resetOverride, registration.storePath, scopeId]);

  // "Stop customizing" — drops this descriptor's whole per-app customization
  // (distinct from "Reset all", which only reverts edits to the scoped origin).
  // The tab disappears via the live scopes resource, so fall back to Base.
  const handleStopCustomizing = useCallback(() => {
    if (!scopeId) return;
    removeScope({ body: { storePath: registration.storePath, scopeId } });
    onSelectScope(undefined);
  }, [removeScope, registration.storePath, scopeId, onSelectScope]);

  const toggleIcon = showRaw
    ? <MdTune className="size-3.5" />
    : <MdCode className="size-3.5" />;

  return (
    <>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the action toolbar from the fields below (no named margin utility) */}
      <Stack direction="row" align="center" justify="end" gap="sm" className="mb-1">
        {scopeId && !showRaw && (
          <Button
            variant="ghost"
            onClick={handleStopCustomizing}
          >
            <MdLayersClear className="size-3.5" />
            Stop customizing
          </Button>
        )}
        {hasAnyModified && !showRaw && (
          confirmReset ? (
            <Stack direction="row" align="center" gap="xs">
              <Text variant="caption" tone="muted">Reset all fields?</Text>
              <Button
                variant="ghost"
                onClick={handleResetAll}
                className="bg-destructive/20 text-destructive hover:bg-destructive/30"
              >
                Reset
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </Button>
            </Stack>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirmReset(true)}
            >
              <MdUndo className="size-3.5" />
              Reset all
            </Button>
          )
        )}
        <Button
          variant="ghost"
          onClick={() => setShowRaw((v) => !v)}
        >
          {toggleIcon}
          {showRaw ? "Fields" : "Raw file"}
        </Button>
      </Stack>
      {showRaw ? (
        <RawFileView storePath={registration.storePath} scopeId={scopeId} />
      ) : (
        <>
          {conflictEntry && (
            conflictEntry.kind === "invalid" ? (
              <>
                {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the invalid banner from the fields below (no named margin utility) */}
                <Text as="div" variant="body" className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-md py-sm text-destructive">
                  <Stack gap="xs">
                    <Frame
                      leading={<MdWarning className="size-4" />}
                      content={<span>Stored config is invalid for the current schema</span>}
                      trailing={
                        <Stack direction="row" gap="xs">
                          <Button
                            variant="ghost"
                            onClick={() => setShowDiff((v) => !v)}
                            className="bg-destructive/20 hover:bg-destructive/30"
                          >
                            <MdDifference className="size-3.5" />
                            {showDiff ? "Hide diff" : "View diff"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setShowRaw(true)}
                            className="bg-destructive/20 hover:bg-destructive/30"
                          >
                            View raw
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={handleAcceptAll}
                            className="bg-destructive/20 hover:bg-destructive/30"
                          >
                            Reset to defaults
                          </Button>
                        </Stack>
                      }
                    />
                    {conflictEntry.issues && conflictEntry.issues.length > 0 && (
                      // eslint-disable-next-line spacing/no-adhoc-spacing -- ml indents the issue list under the banner heading (no named margin utility)
                      <Stack gap="sm" className="ml-6">
                        {conflictEntry.issues.map((issue, i) => {
                          const value = drillPath(conflictEntry.overrideValues, issue.path);
                          const label = issue.path.length > 0 ? issue.path.join(".") : "(root)";
                          return (
                            <Stack key={i} gap="xs">
                              <Text as="div" variant="caption" className="text-destructive/90">
                                <code className="rounded-sm bg-destructive/15 px-xs font-medium">{label}</code>
                                {" — "}
                                {issue.message}
                              </Text>
                              {value === MISSING ? (
                                <Text as="div" variant="caption" tone="muted">(value missing)</Text>
                              ) : (
                                <HighlightedCode code={JSON.stringify(value, null, 2)} lang="json" />
                              )}
                            </Stack>
                          );
                        })}
                      </Stack>
                    )}
                  </Stack>
                </Text>
                {showDiff && <InvalidDiff storePath={registration.storePath} />}
              </>
            ) : isSoftConflict ? (
              // eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the soft-conflict banner from the fields below (no named margin utility)
              <Text as="div" variant="body" className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-md py-sm text-warning">
                <Frame
                  content={<span>Defaults updated — no conflicts</span>}
                  trailing={
                    <Button
                      variant="ghost"
                      onClick={handleDismiss}
                      className="bg-warning/20 hover:bg-warning/30"
                    >
                      Dismiss
                    </Button>
                  }
                />
              </Text>
            ) : (
              <>
                {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the hash-conflict banner from the fields below (no named margin utility) */}
                <Text as="div" variant="body" className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-md py-sm text-warning">
                  <Frame
                    leading={<MdWarning className="size-4" />}
                    content={
                      <span>
                        {canMerge && trueConflictKeys!.length > 0
                          ? `Upstream defaults changed — ${trueConflictKeys!.length} field${trueConflictKeys!.length === 1 ? "" : "s"} need${trueConflictKeys!.length === 1 ? "s" : ""} your attention`
                          : canMerge
                            ? "Upstream defaults changed — ready to merge cleanly"
                            : "Upstream defaults changed"}
                      </span>
                    }
                    trailing={
                      <Stack direction="row" gap="xs">
                        <Button
                          variant="ghost"
                          onClick={() => setShowDiff((v) => !v)}
                          className="bg-warning/20 hover:bg-warning/30"
                        >
                          <MdDifference className="size-3.5" />
                          {showDiff ? "Hide diff" : "View diff"}
                        </Button>
                        {canMerge && (
                          <Button
                            variant="ghost"
                            onClick={handleMerge}
                            className="bg-warning/20 hover:bg-warning/30"
                          >
                            <MdMerge className="size-3.5" />
                            Merge
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={handleAcceptAll}
                          className="bg-warning/20 hover:bg-warning/30"
                        >
                          Accept all new defaults
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={handleDismiss}
                          className="bg-warning/20 hover:bg-warning/30"
                        >
                          Keep my values
                        </Button>
                      </Stack>
                    }
                  />
                </Text>
                {showDiff && <ConflictDiff storePath={registration.storePath} />}
              </>
            )
          )}
          {Object.entries(registration.descriptor.fields).map(([key, field]) => (
            <ConfigFieldRow
              key={key}
              fieldKey={key}
              field={field}
              value={valueFor(key)}
              defaultValue={defaults[key]}
              storePath={registration.storePath}
              scopeId={scopeId}
              originValue={conflictEntry?.originValues[key]}
              trueConflictKeys={trueConflictKeys}
              tier={tiers[key]}
            />
          ))}
        </>
      )}
    </>
  );
}

function RawFileView({ storePath, scopeId }: { storePath: string; scopeId: string | undefined }) {
  const { data, isPending } = useEndpoint(getConfigRawFile, {}, {
    query: { storePath, ...(scopeId ? { scopeId } : {}) },
  });

  if (isPending) return <Loading />;
  if (!data) return <Placeholder>No data</Placeholder>;

  // The running app resolves to the user-layer origin (the propagated git config).
  // It normally equals the git origin; when it diverges a build/propagation is
  // pending, and that file is the one the app actually reads — worth surfacing.
  const showResolved = data.origin !== null && data.origin !== data.gitOrigin;

  return (
    <Stack gap="md">
      <RawSection label="User override" path={data.overridePath} code={data.override} />
      <RawSection label="Git override" path={data.gitOverridePath} code={data.gitOverride} />
      <RawSection label="Origin (defaults)" path={data.gitOriginPath} code={data.gitOrigin} />
      {showResolved && (
        <RawSection label="Resolved origin (app reads — build pending)" path={data.originPath} code={data.origin} />
      )}
    </Stack>
  );
}

function RawSection({ label, path, code }: { label: string; path: string; code: string | null }) {
  return (
    <section>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the section label from the code block below (no named margin utility) */}
      <Text as="div" variant="caption" tone="muted" className="mb-1">
        <Frame
          align="baseline"
          leading={<span className="whitespace-nowrap font-medium">{label}</span>}
          content={<Text className="font-mono opacity-70" title={path}>{path}</Text>}
        />
      </Text>
      {code !== null ? (
        <HighlightedCode code={code} lang="json" />
      ) : (
        <Placeholder>not set</Placeholder>
      )}
    </section>
  );
}
