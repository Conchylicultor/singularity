import type React from "react";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import type { TaskChainRelateMode } from "@plugins/tasks/core";

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
    <Stack direction="row" align="center" gap="xs">
      <Text as="span" variant="caption" tone="muted">Mode</Text>
      <Inline
        as="div"
        gap="none"
        role="radiogroup"
        aria-label="Relation to current task"
        className="border-border bg-muted/40 rounded-md border p-2xs"
      >
        {modes.map((m) => {
          const effective = m.value === "independent" ? undefined : m.value;
          const selected = effective === value;
          return (
            <ToggleChip
              key={m.value}
              role="radio"
              aria-checked={selected}
              active={selected}
              variant="solid"
              size="sm"
              disabled={disabled}
              title={m.title}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onChange(effective);
              }}
            >
              {m.label}
            </ToggleChip>
          );
        })}
      </Inline>
    </Stack>
  );
}
