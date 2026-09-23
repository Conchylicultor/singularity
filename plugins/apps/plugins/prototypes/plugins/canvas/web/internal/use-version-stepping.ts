import type {
  PrototypeHistory,
  PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import {
  stepBy,
  versionForStep,
  versionSteps,
  type VersionStep,
  type VersionSteps,
} from "./version-steps";

export interface VersionStepping {
  model: VersionSteps;
  /** The stop on screen — `null` when the shown sha left the history. */
  current: VersionStep | null;
  /** The stop one step older / newer, `null` past either end. */
  prev: VersionStep | null;
  next: VersionStep | null;
  /** Show `step` (a no-op for `null`). */
  go: (step: VersionStep | null) => void;
  /** Stable-identity steps, safe to register as shortcuts. */
  stepBack: () => void;
  stepForward: () => void;
}

/**
 * Where a frame's shown version stands in `history`, and how to move it —
 * parametrized by the pair (`shown`, `show`), so every frame on the canvas
 * steps on its own and nothing here reads a context.
 */
export function useVersionStepping(
  history: PrototypeHistory,
  {
    shown,
    show,
  }: {
    /** The version on screen — `null` for the live folder. */
    shown: PrototypeVersion | null;
    show: (version: PrototypeVersion | null) => void;
  },
): VersionStepping {
  const model = versionSteps(history, shown?.sha ?? null);
  const current = model.current === null ? null : model.steps[model.current]!;
  const prev = stepBy(model, -1);
  const next = stepBy(model, 1);
  const go = (step: VersionStep | null) => {
    if (step) show(versionForStep(step));
  };
  const stepBack = useEventCallback(() => go(prev));
  const stepForward = useEventCallback(() => go(next));
  return { model, current, prev, next, go, stepBack, stepForward };
}
