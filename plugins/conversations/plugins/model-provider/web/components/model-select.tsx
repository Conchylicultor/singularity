import {
  MODEL_REGISTRY,
  normalizeModel,
  type ConversationModel,
} from "../../core";
import { useVisibleModels } from "../internal/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const OFF = "none";

export interface ModelSelectProps {
  /** The selected model, or `null` for the Off option. */
  value: ConversationModel | null;
  onChange: (model: ConversationModel | null) => void;
  /** Label for the Off option. Defaults to "Off". */
  offLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Controlled model picker shared by every "auto-launch with" surface
 * (task auto-start, task-draft form, agent auto-launch). Lists exactly the
 * models the launch dropdown shows (`useVisibleModels`) plus an Off option,
 * so all model pickers stay in lockstep with the registry.
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
  const selected = value != null ? normalizeModel(value) : OFF;

  // base-ui resolves the collapsed trigger label from `items`, not from the
  // (unmounted) option list. Map every registry id — not just visible ones —
  // so a stored hidden model still shows its label.
  const items: Record<string, string> = {
    [OFF]: offLabel,
    ...Object.fromEntries(
      (Object.keys(MODEL_REGISTRY) as ConversationModel[]).map((m) => [m, MODEL_REGISTRY[m].label]),
    ),
  };

  return (
    <Select
      items={items}
      value={selected}
      onValueChange={(v: string | null) => {
        if (!v) return;
        onChange(v === OFF ? null : (v as ConversationModel));
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("h-7 w-32 text-caption", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OFF}>{offLabel}</SelectItem>
        {visibleModels.map((m) => (
          <SelectItem key={m} value={m}>
            {MODEL_REGISTRY[m].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
