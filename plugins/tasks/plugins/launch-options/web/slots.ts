import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { LaunchOptionDef } from "../core/internal/define";

/**
 * What every launch control receives. Controlled on purpose: the HOST owns
 * storage — the task detail writes the task's row, the draft popover writes a
 * card's local draft — so the same control serves a task that exists and one
 * that does not exist yet.
 */
export interface LaunchControlProps<V> {
  value: V;
  onChange: (next: V) => void;
  disabled?: boolean;
}

/** A control bound to an existing task's persisted value. */
export interface LaunchBinding<V> {
  value: V;
  onChange: (next: V) => void;
}

/**
 * One launch option: a labelled control that configures HOW the agent launches
 * (which model auto-starts it, which preprompt is prepended, which thinking
 * mode it runs at). Each host owns its own chrome — the detail card paints a
 * label column, the draft card paints an inline chip — so a contribution is
 * only its control plus the value contract behind it.
 */
export interface TaskLaunchOption<V> {
  /** Row label in the detail card; chip label in the draft card. */
  label: string;
  /** The shared value contract (see `defineLaunchOption`). */
  def: LaunchOptionDef<V>;
  /** The control itself. Controlled — see {@link LaunchControlProps}. */
  component: ComponentType<LaunchControlProps<V>>;
  /**
   * Binds the control to an EXISTING task's storage. Omit it and the option is
   * draft-only — self-describing, so there is no `hosts: [...]` knob to keep in
   * sync with what the plugin actually implements.
   */
  useTaskBinding?: (taskId: string) => LaunchBinding<V>;
  /** Short value description folded into the post-submit toast. */
  summarize?: (value: V) => string | null;
}

/**
 * The erased entry the slot stores. A render slot carries ONE contribution
 * type, so `V` collapses to `unknown` here; `TaskLaunch.Option` re-introduces it
 * at the call site, which is the only place drift could happen.
 */
export type LaunchOptionEntry = TaskLaunchOption<unknown> & { id: string };

/**
 * What a NON-rendering consumer needs off an option — the draft's value read,
 * the submit strip, the toast. Deliberately excludes `component`, which
 * `useContributions()` seals.
 */
export interface LaunchOptionInfo {
  id: string;
  def: LaunchOptionDef<unknown>;
  summarize?: (value: unknown) => string | null;
}

const OptionSlot = defineRenderSlot<TaskLaunchOption<unknown>>(
  "tasks.launch-option",
  {
    docLabel: (p) => p.label,
    // Size-owning: every contributed control inherits `sm`, in both hosts.
    controlSize: "sm",
  },
);

/**
 * The one erasure in the contract. `V` is what ties `def`, `component`,
 * `useTaskBinding` and `summarize` together, so it must survive to the call
 * site — but the slot can only store one type. Widening here (rather than
 * declaring the slot over `unknown` and letting each contributor cast) keeps
 * every contribution internally type-checked.
 */
function contributeOption<V>(
  option: TaskLaunchOption<V> & { id: string },
) {
  return OptionSlot(option as unknown as LaunchOptionEntry);
}

/**
 * The launch-option registry, rendered by BOTH surfaces: the task detail's
 * Prompt card and the task-draft popover. `TaskLaunch.Option` is the generic
 * contribution factory above with the render slot's own members (`.Render`,
 * `.useContributions`, `.id`) folded onto it, so one name is both how an option
 * is contributed and how a host reads the set.
 */
export const TaskLaunch = {
  Option: Object.assign(contributeOption, OptionSlot),
};
