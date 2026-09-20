import { MdAutoAwesome } from "react-icons/md";
import { PickerPill } from "@plugins/primitives/plugins/text-editor/plugins/composer/plugins/picker-pill/web";
import {
  MODEL_REGISTRY,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
import { useModelItems } from "@plugins/conversations/plugins/model-provider/web";
import {
  EFFORT_REGISTRY,
  EFFORT_UNSET_LABEL,
  type EffortLevel,
} from "@plugins/conversations/plugins/effort-provider/core";
import { effortItems } from "@plugins/conversations/plugins/effort-provider/web";

export type RunPillProps = {
  model: ConversationModel;
  onModelChange: (model: ConversationModel) => void;
  /** The picked thinking mode, or `null` to let the agent decide. */
  effort: EffortLevel | null;
  onEffortChange: (effort: EffortLevel | null) => void;
  disabled?: boolean;
};

/**
 * The two things that decide HOW the agent runs — which model, and how hard it
 * thinks — as ONE pill reading `✦ Opus 5  Auto`, opening a menu with a headed
 * group each.
 *
 * They are fused because neither is meaningful alone at a glance and two pills
 * side by side read as two unrelated settings. The model reads at full
 * strength and the thinking mode muted after it, so the pill says "Opus 5,
 * thinking Auto" rather than naming two equal values. A fused pill never
 * tints: "set" would be ambiguous across its groups.
 *
 * The trigger's labels come from the registries rather than from the menu rows,
 * so a model the config has hidden — still a legitimate current value — is
 * named instead of reading blank.
 */
export function RunPill({
  model,
  onModelChange,
  effort,
  onEffortChange,
  disabled,
}: RunPillProps) {
  const models = useModelItems();
  const efforts = effortItems();

  return (
    <PickerPill
      icon={MdAutoAwesome}
      placeholder="Model"
      disabled={disabled}
      ariaLabel="Model and thinking mode"
    >
      <PickerPill.Value>{MODEL_REGISTRY[model].label}</PickerPill.Value>
      <PickerPill.Value muted>
        {effort === null ? EFFORT_UNSET_LABEL : EFFORT_REGISTRY[effort].label}
      </PickerPill.Value>
      <PickerPill.Group title="Model">
        {models.map((item) => (
          <PickerPill.Item
            key={item.value}
            selected={item.value === model}
            onSelect={() => onModelChange(item.value)}
          >
            {item.label}
          </PickerPill.Item>
        ))}
      </PickerPill.Group>
      <PickerPill.Group title="Thinking mode">
        <PickerPill.Item
          selected={effort === null}
          onSelect={() => onEffortChange(null)}
        >
          {EFFORT_UNSET_LABEL}
        </PickerPill.Item>
        {efforts.map((item) => (
          <PickerPill.Item
            key={item.value}
            selected={item.value === effort}
            onSelect={() => onEffortChange(item.value)}
          >
            {item.label}
          </PickerPill.Item>
        ))}
      </PickerPill.Group>
    </PickerPill>
  );
}
