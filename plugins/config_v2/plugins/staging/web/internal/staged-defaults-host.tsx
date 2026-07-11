import { useCallback, useEffect } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { stageConfigDefault } from "../../core/endpoints";
import {
  stagedConfigDefaultsResource,
  type StagedConfigDefault,
} from "../../core/resources";
import { setStageDispatch, setStagedDefaultsData } from "./staged-defaults-store";

// Variables for one optimistic stage op — the full config document for a
// descriptor identified by (pluginId, configName).
interface StageVars {
  pluginId: string;
  configName: string;
  value: unknown;
}

// The staged `value` is plain JSON, so a stable stringify comparison is the
// simplest correct structural equality. No shared deepEqual util exists in the
// repo; a heavier dependency is unwarranted for confirming an already-normalized
// document.
function valueEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameKey(r: StagedConfigDefault, vars: StageVars): boolean {
  return r.pluginId === vars.pluginId && r.configName === vars.configName;
}

// Last-write-wins upsert by (pluginId, configName), mirroring the DB composite
// primary key. Keep the array sorted by the composite key to match the server
// loader's order so the optimistic base and the authoritative push render the
// same way.
function upsertRow(
  rows: StagedConfigDefault[],
  vars: StageVars,
): StagedConfigDefault[] {
  const next: StagedConfigDefault = {
    pluginId: vars.pluginId,
    configName: vars.configName,
    value: vars.value,
    authorId: null,
    updatedAt: new Date(),
  };
  const without = rows.filter((r) => !sameKey(r, vars));
  return [...without, next].sort(
    (a, b) =>
      a.pluginId.localeCompare(b.pluginId) ||
      a.configName.localeCompare(b.configName),
  );
}

/**
 * Headless `Core.Root` host that owns the single optimistic overlay on
 * `stagedConfigDefaultsResource`, shared by every staging consumer. Because
 * `Core.Root` renders exactly once app-wide, this is the single instance that
 * keeps all pending stage ops in one ordered layer (concurrent edits on the same
 * resource cache key never race). It lives inside `NotificationsProvider` (the
 * `Core.Root` tree is under it in the bootstrap `App.tsx`), so the live-state
 * read works.
 *
 * It publishes the overlay's latest `data` + a stable `dispatch` wrapper into
 * the module store (`staged-defaults-store`); the exported read hooks consume
 * the store, so no React context / app-root provider mount is needed.
 */
export function StagedDefaultsOverlayHost() {
  const { data, dispatch } = useOptimisticResource<StagedConfigDefault[], StageVars>({
    resource: stagedConfigDefaultsResource,
    apply: upsertRow,
    mutate: (vars) =>
      fetchEndpoint(
        stageConfigDefault,
        {},
        {
          body: {
            pluginId: vars.pluginId,
            configName: vars.configName,
            value: vars.value,
          },
        },
      ).then((r) => ({ watermark: r.watermark })),
    isConfirmedBy: (rows, vars) =>
      rows.some((r) => sameKey(r, vars) && valueEqual(r.value, vars.value)),
    // Op identity for cascade confirmation: stages are last-write-wins per
    // (pluginId, configName), so only a newer confirmed stage of the SAME key
    // may supersede an older resolved one (its value can never reappear in a
    // snapshot). A confirmation for one config must never drop another
    // config's still-pending stage.
    sameTarget: (a, b) => a.pluginId === b.pluginId && a.configName === b.configName,
  });

  const stage = useCallback(
    (pluginId: string, configName: string, value: unknown) => {
      dispatch({ pluginId, configName, value });
    },
    [dispatch],
  );

  // Bridge the React-state overlay output into the module store so cross-mount
  // consumers read it without a context provider. This is the sanctioned
  // headless-host → module-store publish pattern.
  useEffect(() => {
    setStagedDefaultsData(data);
  }, [data]);

  useEffect(() => {
    setStageDispatch(stage);
  }, [stage]);

  return null;
}
