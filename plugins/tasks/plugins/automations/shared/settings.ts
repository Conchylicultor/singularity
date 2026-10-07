import { normalizeModelChoice } from "@plugins/conversations/plugins/model-provider/core";
import type { AutomationSettings, AutomationSource } from "../core";

/** One saved `automationsConfig.settings` item, as the config reads it. */
export interface SavedAutomationSettings {
  automationId: string;
  enabled: boolean;
  autoPush: boolean;
  model: string;
  excludedSources: readonly string[];
}

/** A saved item with the list item `id` the config keeps on every row. */
export type SavedAutomationListItem = SavedAutomationSettings & { id: string };

/**
 * The settings an automation runs with: its saved item when there is one —
 * which replaces the declared defaults as a whole — else the defaults. Two
 * items for one automation is a corrupt file, not a choice: it throws, naming
 * the automation, rather than picking one.
 */
export function resolveAutomationSettings(
  saved: readonly SavedAutomationSettings[],
  automationId: string,
  defaults: AutomationSettings,
): AutomationSettings {
  const items = saved.filter((s) => s.automationId === automationId);
  if (items.length > 1) {
    throw new Error(
      `[automations] ${items.length} saved settings items for automation "${automationId}" — keep one`,
    );
  }
  const item = items[0];
  if (item === undefined) return defaults;
  return {
    enabled: item.enabled,
    autoPush: item.autoPush,
    model: normalizeModelChoice(item.model),
    excludedSources: [...item.excludedSources],
  };
}

/** The sources that take part: every declared one the settings do not exclude. */
export function includedSources(
  sources: readonly AutomationSource[],
  settings: AutomationSettings,
): AutomationSource[] {
  const excluded = new Set(settings.excludedSources);
  return sources.filter((s) => !excluded.has(s.id));
}

/**
 * The saved list with this automation's item set to `settings` — written WHOLE,
 * since an item replaces the defaults as a whole: a field the person never
 * touched is written as the value it resolved to, never left out. The item
 * keeps its place and its list `id`; an automation with no item yet gets one
 * appended, keyed by the automation's id. Throws (via the resolve) on a
 * corrupt file with two items for one automation, rather than writing over one.
 */
export function withAutomationSettings(
  saved: readonly SavedAutomationListItem[],
  automationId: string,
  settings: AutomationSettings,
): SavedAutomationListItem[] {
  resolveAutomationSettings(saved, automationId, settings);
  const item = {
    automationId,
    enabled: settings.enabled,
    autoPush: settings.autoPush,
    model: settings.model,
    excludedSources: [...settings.excludedSources],
  };
  const at = saved.findIndex((s) => s.automationId === automationId);
  if (at === -1) return [...saved, { id: automationId, ...item }];
  return saved.map((s, i) => (i === at ? { ...s, ...item } : s));
}
