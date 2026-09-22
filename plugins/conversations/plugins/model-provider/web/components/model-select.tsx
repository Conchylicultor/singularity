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

export interface ModelSelectProps {
  /** The selected model choice, or `null` for the Off option. */
  value: ModelChoice | null;
  onChange: (model: ModelChoice | null) => void;
  /** Label for the Off option. Defaults to "Off". */
  offLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Controlled model picker shared by every "auto-launch with" surface
 * (task auto-start, agent). Lists exactly the choices the launch dropdown
 * shows (`useVisibleModels`) plus an Off option, so all model pickers stay in
 * lockstep with the registry.
 */
export function ModelSelect({
  value,
  onChange,
  offLabel = "Off",
  ariaLabel,
  disabled,
  className,
}: ModelSelectProps) {
  const visibleModels = useVisibleModels();
  const selected = value ?? OFF;

  // base-ui resolves the collapsed trigger label from `items`, not from the
  // (unmounted) option list. Map every choice — not just visible ones — so a
  // stored hidden pinned version still shows its label.
  const items: Record<string, string> = {
    [OFF]: offLabel,
    ...Object.fromEntries(
      ModelChoiceSchema.options.map((m) => [m, choiceLabel(m)]),
    ),
  };

  return (
    <Select
      items={items}
      value={selected}
      onValueChange={(v: string | null) => {
        if (!v) return;
        onChange(v === OFF ? null : ModelChoiceSchema.parse(v));
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("w-32", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OFF}>{offLabel}</SelectItem>
        {visibleModels.map((m) => (
          <SelectItem key={m} value={m}>
            <ModelChoiceLabel choice={m} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
