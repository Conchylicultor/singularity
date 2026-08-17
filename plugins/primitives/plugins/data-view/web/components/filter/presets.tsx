import type { ReactNode } from "react";
import { useFilterPresets } from "../../internal/use-filter-presets";
import { filterPresetMatchesGroup } from "../../internal/sort-presets";
import { useDataViewControls } from "../controls/controls-context";
import {
  PresetDeletePanel,
  PresetSection,
  type PresetEntry,
} from "../presets/preset-section";
import { SavePresetPanel } from "../presets/save-preset-panel";

/**
 * The filter panel's three preset surfaces — the twin of the sort ones, and for
 * the same reason each reads the presets config LIVE rather than taking it as a
 * prop: two of them are pushed pages, whose `render` closure is captured when the
 * row is clicked.
 *
 * A filter preset has no partial-resolution notion (the whole tree applies or
 * nothing does), so every entry is applicable.
 */

function useFilterPresetEntries(): {
  entries: PresetEntry[];
  apply: (id: string) => void;
  deletePreset: (id: string) => void;
} {
  const { storageKey, filter } = useDataViewControls();
  const presets = useFilterPresets(storageKey);

  const entries = presets.presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    active: filterPresetMatchesGroup(preset, filter.filter),
  }));

  return {
    entries,
    apply: (id) => {
      const preset = presets.presets.find((p) => p.id === id);
      if (preset) filter.setFilter(preset.group);
    },
    deletePreset: presets.deletePreset,
  };
}

/** The "Presets" section at the top of the filter panel. Null when there are none. */
export function FilterPresetSection(): ReactNode {
  const { entries, apply } = useFilterPresetEntries();
  return (
    <PresetSection
      entries={entries}
      onApply={apply}
      deletePanel={() => <FilterPresetDeletePanel />}
    />
  );
}

/** The pushed "Delete a preset" page. */
export function FilterPresetDeletePanel(): ReactNode {
  const { entries, deletePreset } = useFilterPresetEntries();
  return <PresetDeletePanel entries={entries} onDelete={deletePreset} />;
}

/** The pushed "Save as preset" page — captures the live filter tree on submit. */
export function FilterSavePresetPanel(): ReactNode {
  const { storageKey, filter } = useDataViewControls();
  const presets = useFilterPresets(storageKey);
  return (
    <SavePresetPanel
      onSave={(label) => {
        if (filter.filter) presets.savePreset(label, filter.filter);
      }}
    />
  );
}
