import { cn } from "@/lib/utils";

export type ChainModel = "queue" | "sonnet" | "opus";

const MODELS: { value: ChainModel; label: string }[] = [
  { value: "queue", label: "Queue" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
];

export interface ModelChipProps {
  value: ChainModel;
  onChange: (next: ChainModel) => void;
  disabled?: boolean;
}

export function ModelChip({ value, onChange, disabled }: ModelChipProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Launch model"
      className="border-border bg-muted/40 inline-flex items-center rounded-md border p-0.5 text-xs"
    >
      {MODELS.map((m) => {
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
  );
}
