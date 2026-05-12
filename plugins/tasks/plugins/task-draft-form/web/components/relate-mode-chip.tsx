import { cn } from "@/lib/utils";
import type { TaskChainRelateMode } from "../../core/types";

type ModeValue = TaskChainRelateMode | "independent";

const RELATE_MODES: { value: ModeValue; label: string; title: string }[] = [
  {
    value: "independent",
    label: "Independent",
    title: "Create a standalone task with no relation",
  },
  {
    value: "followup",
    label: "Follow-up",
    title: "Start this task after the current task is done",
  },
  {
    value: "prerequisite",
    label: "Prerequisite",
    title: "This task must complete before the current task",
  },
];

export interface RelateModeChipProps {
  value: TaskChainRelateMode | undefined;
  onChange: (next: TaskChainRelateMode | undefined) => void;
  showIndependent?: boolean;
  disabled?: boolean;
}

export function RelateModeChip({
  value,
  onChange,
  showIndependent,
  disabled,
}: RelateModeChipProps) {
  const modes = showIndependent
    ? RELATE_MODES
    : RELATE_MODES.filter((m) => m.value !== "independent");

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Mode</span>
      <div
        role="radiogroup"
        aria-label="Relation to current task"
        className="border-border bg-muted/40 inline-flex items-center rounded-md border p-0.5"
      >
        {modes.map((m) => {
          const effective = m.value === "independent" ? undefined : m.value;
          const selected = effective === value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              title={m.title}
              onClick={(e) => {
                e.stopPropagation();
                onChange(effective);
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
