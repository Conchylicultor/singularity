import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { choiceLabel, ModelChoiceSchema, type ModelChoice } from "../../core";
import { useVisibleModels } from "../internal/hooks";
import { ModelChoiceLabel } from "./model-choice-label";

const OFF = "none";

interface ModelSelectCommon {
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Two shapes, told apart by `allowOff`: a picker that offers Off (the default —
 * "auto-launch with", where no model means do not launch) hands back `null`
 * for it, and one that does not (`allowOff: false` — a setting that always
 * names a model) can only hand back a model, so its caller never handles an
 * Off it cannot be given.
 */
export type ModelSelectProps = ModelSelectCommon &
  (
    | {
        allowOff?: true;
        /** The selected model choice, or `null` for the Off option. */
        value: ModelChoice | null;
        onChange: (model: ModelChoice | null) => void;
        /** Label for the Off option. Defaults to "Off". */
        offLabel?: string;
      }
    | {
        allowOff: false;
        value: ModelChoice;
        onChange: (model: ModelChoice) => void;
        offLabel?: never;
      }
  );

/**
 * Controlled model picker shared by every "auto-launch with" surface
 * (task auto-start, agent, an automation's model). Lists exactly the choices
 * the launch dropdown shows (`useVisibleModels`) plus, unless `allowOff:
 * false`, an Off option, so all model pickers stay in lockstep with the
 * registry.
 */
export function ModelSelect(props: ModelSelectProps) {
  const { value, ariaLabel, disabled, className } = props;
  const offLabel = props.offLabel ?? "Off";
  const withOff = props.allowOff !== false;
  const visibleModels = useVisibleModels();
  const selected = value ?? OFF;

  // base-ui resolves the collapsed trigger label from `items`, not from the
  // (unmounted) option list. Label every visible choice AND the selected one —
  // a stored hidden pinned version still shows its label, derived from its id.
  const items: Record<string, string> = {
    ...(withOff ? { [OFF]: offLabel } : {}),
    ...Object.fromEntries(visibleModels.map((m) => [m, choiceLabel(m)])),
    ...(value ? { [value]: choiceLabel(value) } : {}),
  };

  return (
    <Select
      items={items}
      value={selected}
      onValueChange={(v: string | null) => {
        if (!v) return;
        if (props.allowOff === false) {
          props.onChange(ModelChoiceSchema.parse(v));
          return;
        }
        props.onChange(v === OFF ? null : ModelChoiceSchema.parse(v));
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("w-32", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {withOff ? <SelectItem value={OFF}>{offLabel}</SelectItem> : null}
        {visibleModels.map((m) => (
          <SelectItem key={m} value={m}>
            <ModelChoiceLabel choice={m} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
