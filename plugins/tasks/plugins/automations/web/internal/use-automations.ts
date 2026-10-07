import { useCallback, useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  combineResources,
  mapResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { useConfigResult, useSetConfig } from "@plugins/config_v2/web";
import {
  automationsCatalog,
  type AutomationEntry,
  type AutomationSettings,
} from "../../core";
import { automationsConfig } from "../../shared/config";
import {
  resolveAutomationSettings,
  withAutomationSettings,
  type SavedAutomationListItem,
} from "../../shared/settings";

/**
 * One automation as the panes show it: its declaration, the settings it runs
 * with now (its saved item, else its declared defaults), and the saved list
 * those were read from — the base a write starts from.
 */
export interface AutomationView {
  entry: AutomationEntry;
  settings: AutomationSettings;
  saved: readonly SavedAutomationListItem[];
}

/**
 * Every registered automation with its resolved settings. Loading until BOTH
 * the catalog and the settings are known: an automation's on/off state is a
 * claim about the person's settings, so it is never painted from the defaults
 * while the saved file is still on its way.
 */
export function useAutomations(): ResourceResult<AutomationView[]> {
  const catalog = useLive(automationsCatalog);
  const config = useConfigResult(automationsConfig);
  return useMemo(
    () =>
      mapResource(combineResources({ catalog, config }), (d) =>
        d.catalog.map((entry) => ({
          entry,
          settings: resolveAutomationSettings(
            d.config.settings,
            entry.id,
            entry.defaults,
          ),
          saved: d.config.settings,
        })),
      ),
    [catalog, config],
  );
}

/** One automation by id — `null` once the catalog is known and lacks it. */
export function useAutomation(
  automationId: string,
): ResourceResult<AutomationView | null> {
  const all = useAutomations();
  return useMemo(
    () =>
      mapResource(
        all,
        (list) => list.find((a) => a.entry.id === automationId) ?? null,
      ),
    [all, automationId],
  );
}

/**
 * Change some of an automation's settings. The item is written WHOLE — the
 * fields not in `patch` as they resolve now — because a saved item replaces the
 * declared defaults as a whole.
 */
export function useUpdateAutomationSettings(): (
  view: AutomationView,
  patch: Partial<AutomationSettings>,
) => void {
  const set = useSetConfig(automationsConfig);
  return useCallback(
    (view, patch) =>
      set(
        "settings",
        withAutomationSettings(view.saved, view.entry.id, {
          ...view.settings,
          ...patch,
        }),
      ),
    [set],
  );
}
