import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * One launch option: a labelled control that configures HOW the agent launches
 * (which model auto-starts it, which preprompt is prepended, which thinking
 * mode it runs at). The card owns the label column and the row chrome, so a
 * contribution is only its control — the options read as one settings block
 * rather than a stack of drifting one-line cards.
 */
export interface TaskLaunchOption {
  /** Row label, left of the control. */
  label: string;
  /** The control itself. Receives the task the card is showing. */
  component: ComponentType<{ taskId: string }>;
}

/**
 * The Prompt card's own slot. Everything that feeds the agent's first turn —
 * the description, and each launch option beside the Launch button — lives in
 * ONE card, so the user configures and launches in one place.
 */
export const TaskPrompt = {
  LaunchOption: defineRenderSlot<TaskLaunchOption>("task-prompt.launch-option", {
    docLabel: (p) => p.label,
    // Size-owning: every contributed control inherits `sm`, matching the
    // density these same selects had while they rode section headers.
    controlSize: "sm",
  }),
};
