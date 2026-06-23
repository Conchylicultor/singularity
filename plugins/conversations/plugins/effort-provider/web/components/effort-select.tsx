import { cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  EFFORT_REGISTRY,
  SELECTABLE_EFFORTS,
  normalizeEffort,
  type EffortLevel,
} from "../../core";

const OFF = "none";

export interface EffortSelectProps {
  /** The selected thinking mode, or `null` for the Default option. */
  value: EffortLevel | null;
  onChange: (level: EffortLevel | null) => void;
  /** Label for the Default (no mode) option. Defaults to "Default". */
  defaultLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Controlled thinking-mode picker. Lists every selectable effort level plus a
 * Default option (emits `null` → clears the per-task setting), so all effort
 * pickers stay in lockstep with the registry.
 */
export function EffortSelect({
  value,
  onChange,
  defaultLabel = "Default",
  ariaLabel,
  disabled,
  className,
}: EffortSelectProps) {
  const selected = value != null ? normalizeEffort(value) : OFF;

  // base-ui resolves the collapsed trigger label from `items`, not the option list.
  const items: Record<string, string> = {
    [OFF]: defaultLabel,
    ...Object.fromEntries(SELECTABLE_EFFORTS.map((e) => [e, EFFORT_REGISTRY[e].label])),
  };

  return (
    <Select
      items={items}
      value={selected}
      onValueChange={(v: string | null) => {
        if (!v) return;
        onChange(v === OFF ? null : (v as EffortLevel));
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("h-7 w-32 text-caption", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OFF}>{defaultLabel}</SelectItem>
        {SELECTABLE_EFFORTS.map((e) => (
          <SelectItem key={e} value={e}>
            {EFFORT_REGISTRY[e].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
