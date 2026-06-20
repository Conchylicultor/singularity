import { type ReactNode } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { FieldDef, SortPreset, SortRule } from "../../../../core";
import { PresetRow } from "./preset-row";

/**
 * The saved-presets section at the top of the sort popover. Renders nothing when
 * there are no presets; otherwise a "Presets" `SectionLabel` over a short stack
 * of `PresetRow`s (the list is short by nature — no cap). Each row applies on
 * click and carries a hover-revealed delete.
 */
export function PresetList<TRow>(props: {
  presets: SortPreset[];
  sortableFields: FieldDef<TRow>[];
  activeRules: SortRule[];
  onApply: (preset: SortPreset) => void;
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
            sortableFields={props.sortableFields}
            activeRules={props.activeRules}
            onApply={props.onApply}
            onDelete={props.onDelete}
          />
        ))}
      </Stack>
    </Stack>
  );
}
