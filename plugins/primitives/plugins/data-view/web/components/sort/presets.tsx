import type { ReactNode } from "react";
import { useSortPresets } from "../../internal/use-sort-presets";
import {
  presetMatchesRules,
  resolvableRules,
} from "../../internal/sort-presets";
import { useDataViewControls } from "../controls/controls-context";
import {
  PresetDeletePanel,
  PresetSection,
  type PresetEntry,
} from "../presets/preset-section";
import { SavePresetPanel } from "../presets/save-preset-panel";

/**
 * The sort panel's three preset surfaces, each reading the presets config LIVE.
 *
 * They are three components and not one because two of them are pushed pages: a
 * panel-stack entry's `render` closure is captured when the row is clicked, so a
 * page handed its data as a prop would keep showing what was true then. Reading
 * the hooks inside the page instead makes that impossible.
 */

/** Live entries for the current surface, plus the controller behind them. */
function useSortPresetEntries(): {
  entries: PresetEntry[];
  apply: (id: string) => void;
  deletePreset: (id: string) => void;
} {
  const { storageKey, sort } = useDataViewControls();
  const presets = useSortPresets(storageKey);

  const entries = presets.presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    active: presetMatchesRules(preset, sort.rules),
    // A preset whose every field has since left the schema can still be deleted,
    // but applying it would do nothing — so the row says so instead of no-oping.
    applicable: resolvableRules(preset.rules, sort.sortableFields).length > 0,
  }));

  return {
    entries,
    // Apply writes the preset's RESOLVABLE rules into the live sort, so a preset
    // that half-resolves applies the half that does.
    apply: (id) => {
      const preset = presets.presets.find((p) => p.id === id);
      if (preset) {
        sort.setRules(resolvableRules(preset.rules, sort.sortableFields));
      }
    },
    deletePreset: presets.deletePreset,
  };
}

/** The "Presets" section at the top of the sort panel. Null when there are none. */
export function SortPresetSection(): ReactNode {
  const { entries, apply } = useSortPresetEntries();
  return (
    <PresetSection
      entries={entries}
      onApply={apply}
      deletePanel={() => <SortPresetDeletePanel />}
    />
  );
}

/** The pushed "Delete a preset" page. */
export function SortPresetDeletePanel(): ReactNode {
  const { entries, deletePreset } = useSortPresetEntries();
  return <PresetDeletePanel entries={entries} onDelete={deletePreset} />;
}

/** The pushed "Save as preset" page — captures the live rules on submit. */
export function SortSavePresetPanel(): ReactNode {
  const { storageKey, sort } = useDataViewControls();
  const presets = useSortPresets(storageKey);
  return (
    <SavePresetPanel
      onSave={(label) => presets.savePreset(label, sort.rules)}
    />
  );
}
