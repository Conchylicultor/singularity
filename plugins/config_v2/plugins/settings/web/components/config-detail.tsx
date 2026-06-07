import { useMemo, useCallback, useState, useEffect } from "react";
import { MdWarning, MdCode, MdTune, MdUndo, MdDifference } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { fetchEndpoint, useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useConfig, useConfigRegistrations } from "@plugins/config_v2/web";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { acknowledgeConflict, deleteOverride, getConfigRawFile } from "../../core";
import { configDetailPane } from "../internal/panes";
import { useConflicts } from "../internal/use-conflicts";
import { useTiers } from "../internal/use-tiers";
import { ConfigFieldRow } from "./config-field-row";
import { ConflictDiff } from "./conflict-diff";

export function ConfigDetail() {
  const configPath = configDetailPane.useChainEntry()?.params.configPath;
  const registrations = useConfigRegistrations();

  const registration = registrations.find(
    (r) => encodeURIComponent(r.storePath) === configPath,
  );

  if (!registration) {
    return <Placeholder>Config not found</Placeholder>;
  }

  return <ConfigDetailInner registration={registration} />;
}

function ConfigDetailInner({
  registration,
}: {
  registration: ReturnType<typeof useConfigRegistrations>[number];
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const values = useConfig(registration.descriptor);
  const defaults = registration.descriptor.defaults as Record<string, unknown>;
  const conflicts = useConflicts();
  const conflictEntry = conflicts[registration.storePath];
  const tiers = useTiers(registration.storePath);

  useEffect(() => {
    setConfirmReset(false);
    setShowDiff(false);
  }, [registration.storePath]);

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

  const handleDismiss = useCallback(() => {
    void fetchEndpoint(acknowledgeConflict, {}, { body: { storePath: registration.storePath } });
  }, [registration.storePath]);

  const handleAcceptAll = useCallback(() => {
    void fetchEndpoint(deleteOverride, {}, { body: { storePath: registration.storePath } });
  }, [registration.storePath]);

  const handleResetAll = useCallback(() => {
    void fetchEndpoint(deleteOverride, {}, { body: { storePath: registration.storePath } });
    setConfirmReset(false);
  }, [registration.storePath]);

  const toggleIcon = showRaw
    ? <MdTune className="size-3.5" />
    : <MdCode className="size-3.5" />;

  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="mb-1 flex items-center justify-end gap-2">
        {hasAnyModified && !showRaw && (
          confirmReset ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Reset all fields?</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleResetAll}
                className="bg-destructive/20 text-destructive hover:bg-destructive/30"
              >
                Reset
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setConfirmReset(true)}
            >
              <MdUndo className="size-3.5" />
              Reset all
            </Button>
          )
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setShowRaw((v) => !v)}
        >
          {toggleIcon}
          {showRaw ? "Fields" : "Raw file"}
        </Button>
      </div>
      {showRaw ? (
        <RawFileView storePath={registration.storePath} />
      ) : (
        <>
          {conflictEntry && (
            conflictEntry.kind === "invalid" ? (
              <div className="mb-2 flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2">
                  <MdWarning className="size-4 shrink-0" />
                  <span className="flex-1">Stored config is invalid for the current schema</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowRaw(true)}
                      className="bg-destructive/20 hover:bg-destructive/30"
                    >
                      View raw
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={handleAcceptAll}
                      className="bg-destructive/20 hover:bg-destructive/30"
                    >
                      Reset to defaults
                    </Button>
                  </div>
                </div>
                {conflictEntry.issues && conflictEntry.issues.length > 0 && (
                  <ul className="ml-6 list-disc text-xs text-destructive/80">
                    {conflictEntry.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : isSoftConflict ? (
              <div className="mb-2 flex items-center justify-between rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                <span>Defaults updated — no conflicts</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleDismiss}
                  className="shrink-0 bg-warning/20 hover:bg-warning/30"
                >
                  Dismiss
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <MdWarning className="size-4 shrink-0" />
                  <span className="flex-1">Upstream defaults changed</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowDiff((v) => !v)}
                      className="bg-warning/20 hover:bg-warning/30"
                    >
                      <MdDifference className="size-3.5" />
                      {showDiff ? "Hide diff" : "View diff"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={handleAcceptAll}
                      className="bg-warning/20 hover:bg-warning/30"
                    >
                      Accept all new defaults
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={handleDismiss}
                      className="bg-warning/20 hover:bg-warning/30"
                    >
                      Keep my values
                    </Button>
                  </div>
                </div>
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
              originValue={conflictEntry?.originValues[key]}
              tier={tiers[key]}
            />
          ))}
        </>
      )}
    </div>
  );
}

function RawFileView({ storePath }: { storePath: string }) {
  const { data, isPending } = useEndpoint(getConfigRawFile, {}, {
    query: { storePath },
  });

  if (isPending) return <Placeholder>Loading…</Placeholder>;
  if (!data) return <Placeholder>No data</Placeholder>;

  const hasOverride = data.override !== null;

  return (
    <div className="flex flex-col gap-3">
      {hasOverride && (
        <section>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Override</div>
          <HighlightedCode code={data.override!} lang="json" />
        </section>
      )}
      <section>
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {hasOverride ? "Origin (defaults)" : "Origin"}
        </div>
        {data.origin ? (
          <HighlightedCode code={data.origin} lang="json" />
        ) : (
          <Placeholder>No origin file on disk</Placeholder>
        )}
      </section>
    </div>
  );
}
