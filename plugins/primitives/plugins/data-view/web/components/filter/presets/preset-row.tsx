import { type ReactNode } from "react";
import { MdCheck, MdClose } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  ControlSizeProvider,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { FilterGroup, FilterPreset } from "../../../../core";
import { filterPresetMatchesGroup } from "../../../internal/sort-presets";

/**
 * One saved filter preset. The twin of the sort `PresetRow`. A clickable `Row`
 * showing only the preset label (kept label-only to keep the popover quiet). A
 * check marks the preset when the live filter exactly matches it. The whole body
 * applies the preset's group on click; a hover-revealed delete sits in the
 * trailing `actions` slot (`Row` owns the reveal).
 */
export function PresetRow(props: {
  preset: FilterPreset;
  activeFilter: FilterGroup | null;
  onApply: (preset: FilterPreset) => void;
  onDelete: (id: string) => void;
}): ReactNode {
  const { preset } = props;
  const active = filterPresetMatchesGroup(preset, props.activeFilter);

  return (
    <Row
      size="sm"
      hover="muted"
      icon={active ? <MdCheck aria-label="Active preset" /> : undefined}
      onClick={() => props.onApply(preset)}
      actions={
        <ControlSizeProvider size="sm">
          <IconButton
            icon={MdClose}
            label="Delete preset"
            onClick={() => props.onDelete(preset.id)}
          />
        </ControlSizeProvider>
      }
    >
      <SingleLineProvider value={true}>
        <Text>{preset.label}</Text>
      </SingleLineProvider>
    </Row>
  );
}
