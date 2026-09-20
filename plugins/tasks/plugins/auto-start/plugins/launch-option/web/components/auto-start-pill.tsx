import { PickerPill } from "@plugins/primitives/plugins/text-editor/plugins/composer/plugins/picker-pill/web";
import { useModelItems } from "@plugins/conversations/plugins/model-provider/web";
import {
  modelDisplayLabel,
  normalizeModel,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
import type { LaunchControlProps } from "@plugins/tasks/plugins/launch-options/web";

/**
 * What "this task does not auto-start" is called, in the row that sets it and
 * in the fused pill that reads it back — one word, one spelling.
 */
export const AUTO_START_OFF_LABEL = "Off";

/**
 * The model this task auto-starts with, as the pill's text. Never rendered
 * while auto-start is off — the bar paints {@link AUTO_START_OFF_LABEL} (or, on
 * a solo pill, its placeholder) there instead, so this only ever sees a real
 * model.
 */
export function AutoStartPillValue({ value }: { value: ConversationModel }) {
  // A legacy or unknown stored id still reads as a name, exactly as the select
  // in the task detail does.
  return <>{modelDisplayLabel(value)}</>;
}

/**
 * The menu rows: every model the launch dropdown offers, then `Off`. Same
 * source as every other model list — the shared reader — so this pill can never
 * offer a model the launch dropdown hides.
 */
export function AutoStartPillMenu({
  value,
  onChange,
  disabled,
}: LaunchControlProps<ConversationModel | null>) {
  const models = useModelItems();
  const selected = value != null ? normalizeModel(value) : null;
  return (
    <>
      {models.map((model) => (
        <PickerPill.Item
          key={model.value}
          selected={selected === model.value}
          onSelect={() => onChange(model.value)}
          disabled={disabled}
        >
          {model.label}
        </PickerPill.Item>
      ))}
      <PickerPill.Item
        selected={value == null}
        onSelect={() => onChange(null)}
        disabled={disabled}
      >
        {AUTO_START_OFF_LABEL}
      </PickerPill.Item>
    </>
  );
}
