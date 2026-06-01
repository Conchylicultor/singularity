import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { MODEL_REGISTRY } from "@plugins/conversations/plugins/model-provider/core";
import { useVisibleModels } from "@plugins/conversations/plugins/model-provider/web";
import { cn } from "@/lib/utils";

export type ChainModel = "queue" | ConversationModel;

export interface ModelChipProps {
  value: ChainModel;
  onChange: (next: ChainModel) => void;
  disabled?: boolean;
}

export function ModelChip({ value, onChange, disabled }: ModelChipProps) {
  const visibleModels = useVisibleModels();
  const options: { value: ChainModel; label: string }[] = [
    { value: "queue" as const, label: "No" },
    ...visibleModels.map((m) => ({ value: m, label: MODEL_REGISTRY[m].label })),
  ];
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Auto-launch with</span>
      <div
        role="radiogroup"
        aria-label="Launch model"
        className="border-border bg-muted/40 inline-flex items-center rounded-md border p-0.5"
      >
        {options.map((m) => {
          const selected = m.value === value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onChange(m.value);
              }}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
