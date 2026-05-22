import { useMemo, useCallback } from "react";
import { MdWarning } from "react-icons/md";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useConfig, useConfigRegistrations } from "@plugins/config_v2/web";
import { acknowledgeConflict, deleteOverride } from "../../core";
import { configDetailPane } from "../internal/panes";
import { useConflicts } from "../internal/use-conflicts";
import { ConfigFieldRow } from "./config-field-row";

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
  const values = useConfig(registration.descriptor);
  const defaults = registration.descriptor.defaults as Record<string, unknown>;
  const conflicts = useConflicts();
  const conflictEntry = conflicts[registration.storePath];

  const isSoftConflict = useMemo(() => {
    if (!conflictEntry) return false;
    for (const key of Object.keys(registration.descriptor.fields)) {
      if (JSON.stringify(values[key]) !== JSON.stringify(conflictEntry.originValues[key])) {
        return false;
      }
    }
    return true;
  }, [conflictEntry, values, registration.descriptor.fields]);

  const handleDismiss = useCallback(() => {
    void fetchEndpoint(acknowledgeConflict, {}, { body: { storePath: registration.storePath } });
  }, [registration.storePath]);

  const handleAcceptAll = useCallback(() => {
    void fetchEndpoint(deleteOverride, {}, { body: { storePath: registration.storePath } });
  }, [registration.storePath]);

  return (
    <div className="flex flex-col gap-1 p-3">
      {conflictEntry && (
        isSoftConflict ? (
          <div className="mb-2 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <span>Defaults updated — no conflicts</span>
            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 rounded-sm bg-amber-500/20 px-2 py-0.5 text-xs font-medium hover:bg-amber-500/30"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <MdWarning className="size-4 shrink-0" />
            <span className="flex-1">Upstream defaults changed</span>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={handleAcceptAll}
                className="rounded-sm bg-amber-500/20 px-2 py-0.5 text-xs font-medium hover:bg-amber-500/30"
              >
                Accept all new defaults
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-sm bg-amber-500/20 px-2 py-0.5 text-xs font-medium hover:bg-amber-500/30"
              >
                Keep my values
              </button>
            </div>
          </div>
        )
      )}
      {Object.entries(registration.descriptor.fields).map(([key, field]) => (
        <ConfigFieldRow
          key={key}
          fieldKey={key}
          field={field}
          value={values[key]}
          defaultValue={defaults[key]}
          storePath={registration.storePath}
          originValue={conflictEntry?.originValues[key]}
        />
      ))}
    </div>
  );
}
