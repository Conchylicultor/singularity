import { type ReactNode } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { FilterGroup, FilterPreset } from "../../../../core";
import { PresetRow } from "./preset-row";

/**
 * The saved-presets section at the top of the filter popover (twin of the sort
 * `PresetList`). Renders nothing when there are no presets; otherwise a "Presets"
 * `SectionLabel` over a short stack of `PresetRow`s. Each row applies on click and
 * carries a hover-revealed delete.
 */
export function PresetList(props: {
  presets: FilterPreset[];
  activeFilter: FilterGroup | null;
  onApply: (preset: FilterPreset) => void;
  onDelete: (id: string) => void;
}): ReactNode {
  if (props.presets.length === 0) return null;
  return (
    <Stack gap="xs">
      <SectionLabel>Presets</SectionLabel>
      <Stack gap="2xs">
        {props.presets.map((preset) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            activeFilter={props.activeFilter}
            onApply={props.onApply}
            onDelete={props.onDelete}
          />
        ))}
      </Stack>
    </Stack>
  );
}
