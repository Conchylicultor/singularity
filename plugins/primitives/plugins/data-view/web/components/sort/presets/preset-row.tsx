import { type ReactNode } from "react";
import {
  MdArrowDownward,
  MdArrowUpward,
  MdCheck,
  MdClose,
} from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import type { FieldDef, SortPreset, SortRule } from "../../../../core";
import { useResolveDirectionLabels } from "../../../internal/use-direction-labels";
import { presetMatchesRules, resolvableRules } from "../../../internal/sort-presets";

/**
 * One saved sort preset. A clickable `Row` showing the preset label and a
 * compact, type-aware rules preview (field label + direction arrow, the arrow's
 * tooltip resolved through the field-identity direction labels — the same reuse
 * as the live sort rows). A check marks the preset when it exactly matches the
 * live sort. The whole body applies the preset's resolvable rules on click; a
 * hover-revealed delete sits in the trailing `actions` slot (`Row` owns the
 * reveal). A preset with zero resolvable rules is disabled+muted (delete still
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
  const resolveDirectionLabels = useResolveDirectionLabels();
  const resolved = resolvableRules(preset.rules, sortableFields);
  const applicable = resolved.length > 0;
  const active = presetMatchesRules(preset, props.activeRules);

  return (
    <Row
      as="button"
      size="sm"
      hover="muted"
      disabled={!applicable}
      title={applicable ? undefined : "No matching fields"}
      icon={active ? <MdCheck aria-label="Active preset" /> : undefined}
      onClick={applicable ? () => props.onApply(preset) : undefined}
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
      <Stack gap="2xs">
        <TruncatingText>{preset.label}</TruncatingText>
        {resolved.length > 0 ? (
          <Inline gap="xs">
            {resolved.map((rule) => {
              const field = sortableFields.find((f) => f.id === rule.fieldId);
              const labels = resolveDirectionLabels(field?.type);
              const asc = rule.direction === "asc";
              const ArrowIcon = asc ? MdArrowUpward : MdArrowDownward;
              return (
                <WithTooltip
                  key={rule.fieldId}
                  content={asc ? labels.asc : labels.desc}
                >
                  <Inline gap="2xs">
                    <Text variant="caption" tone="muted">
                      {field?.label ?? rule.fieldId}
                    </Text>
                    <ArrowIcon aria-hidden />
                  </Inline>
                </WithTooltip>
              );
            })}
          </Inline>
        ) : null}
      </Stack>
    </Row>
  );
}
