import type { IconType } from "react-icons";
import { MdArrowDownward, MdArrowUpward, MdTripOrigin } from "react-icons/md";
import { PickerPill } from "@plugins/primitives/plugins/text-editor/plugins/composer/plugins/picker-pill/web";
import type { TaskChainRelateMode } from "@plugins/tasks/core";

/** One row of the menu: where this task goes relative to the current one. */
interface DependencyChoice {
  /** `undefined` is the independent task — no edge at all. */
  value: TaskChainRelateMode | undefined;
  /** How the row reads in the menu. */
  label: string;
  /** How the pill's trigger reads once this row is chosen. */
  short: string;
  icon: IconType;
}

const CHOICES: DependencyChoice[] = [
  {
    value: undefined,
    label: "As separate task",
    short: "Separate",
    icon: MdTripOrigin,
  },
  {
    value: "followup",
    label: "As follow up",
    short: "Follow-up",
    icon: MdArrowDownward,
  },
  {
    value: "prerequisite",
    label: "As prerequisite",
    short: "Prerequisite",
    icon: MdArrowUpward,
  },
];

export interface DependencyPillProps {
  value: TaskChainRelateMode | undefined;
  onChange: (next: TaskChainRelateMode | undefined) => void;
  /** Offer the "As separate task" row — only where dropping the edge is allowed. */
  showIndependent?: boolean;
  disabled?: boolean;
}

/**
 * Where the drafted task goes relative to the one you are looking at: nowhere
 * (its own task), after it, or before it.
 *
 * Unset it reads "Dependency" and stays plain — an independent task is the
 * absence of an edge, not a choice you made. Pick either edge and the trigger
 * reads it back and tints, so a card that will be wired to another task says so
 * without opening anything.
 */
export function DependencyPill({
  value,
  onChange,
  showIndependent,
  disabled,
}: DependencyPillProps) {
  const choices = showIndependent
    ? CHOICES
    : CHOICES.filter((choice) => choice.value !== undefined);
  const chosen = value && CHOICES.find((choice) => choice.value === value);

  return (
    <PickerPill
      icon={MdTripOrigin}
      placeholder="Dependency"
      highlight={value !== undefined}
      disabled={disabled}
      ariaLabel="Relation to current task"
    >
      {chosen && <PickerPill.Value>{chosen.short}</PickerPill.Value>}
      <PickerPill.Group title="Where this task goes">
        {choices.map((choice) => (
          <PickerPill.Item
            key={choice.value ?? "independent"}
            icon={<choice.icon aria-hidden className="size-3.5" />}
            selected={choice.value === value}
            onSelect={() => onChange(choice.value)}
            disabled={disabled}
          >
            {choice.label}
          </PickerPill.Item>
        ))}
      </PickerPill.Group>
    </PickerPill>
  );
}
