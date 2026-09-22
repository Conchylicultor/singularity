import { PickerPill } from "@plugins/primitives/plugins/text-editor/plugins/composer/plugins/picker-pill/web";
import {
  ModelChoiceLabel,
  useVisibleModels,
} from "@plugins/conversations/plugins/model-provider/web";
import {
  choiceLabel,
  type ModelChoice,
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
export function AutoStartPillValue({ value }: { value: ModelChoice }) {
  return <>{choiceLabel(value)}</>;
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
}: LaunchControlProps<ModelChoice | null>) {
  const models = useVisibleModels();
  return (
    <>
      {models.map((model) => (
        <PickerPill.Item
          key={model}
          selected={value === model}
          onSelect={() => onChange(model)}
          disabled={disabled}
        >
          <ModelChoiceLabel choice={model} />
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
