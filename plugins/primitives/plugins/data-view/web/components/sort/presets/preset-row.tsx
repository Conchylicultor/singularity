import { type ReactNode } from "react";
import { MdCheck, MdDelete } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  ControlSizeProvider,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { FieldDef, SortPreset, SortRule } from "../../../../core";
import { presetMatchesRules, resolvableRules } from "../../../internal/sort-presets";

/**
 * One saved sort preset. A clickable `Row` showing only the preset label (kept
 * label-only to keep the popover quiet). A check marks the preset when it exactly
 * matches the live sort. The whole body applies the preset's resolvable rules on
 * click; a hover-revealed delete sits in the trailing `actions` slot (`Row` owns
 * the reveal). A preset with zero resolvable rules is disabled+muted (delete still
 * available).
 */
export function PresetRow<TRow>(props: {
  preset: SortPreset;
  sortableFields: FieldDef<TRow>[];
  activeRules: SortRule[];
  onApply: (preset: SortPreset) => void;
  onDelete: (id: string) => void;
}): ReactNode {
  const { preset, sortableFields } = props;
  const applicable = resolvableRules(preset.rules, sortableFields).length > 0;
  const active = presetMatchesRules(preset, props.activeRules);

  return (
    <Row
      size="sm"
      hover="muted"
      disabled={!applicable}
      title={applicable ? undefined : "No matching fields"}
      icon={active ? <MdCheck aria-label="Active preset" /> : undefined}
      onClick={applicable ? () => props.onApply(preset) : undefined}
      actions={
        <ControlSizeProvider size="sm">
          <IconButton
            icon={MdDelete}
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
