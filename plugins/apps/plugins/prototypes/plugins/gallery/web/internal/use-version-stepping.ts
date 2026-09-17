import type { PrototypeHistory } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { usePrototypeDetail } from "../context";
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
 * Where the pane's shown version stands in `history`, and how to move it. The
 * one reading every version control shares — the header stepper and the
 * options picker's Version row — so the two can never disagree about which
 * stop is next.
 */
export function useVersionStepping(history: PrototypeHistory): VersionStepping {
  const { shownVersion, showVersion } = usePrototypeDetail();
  const model = versionSteps(history, shownVersion?.sha ?? null);
  const current = model.current === null ? null : model.steps[model.current]!;
  const prev = stepBy(model, -1);
  const next = stepBy(model, 1);
  const go = (step: VersionStep | null) => {
    if (step) showVersion(versionForStep(step));
  };
  const stepBack = useEventCallback(() => go(prev));
  const stepForward = useEventCallback(() => go(next));
  return { model, current, prev, next, go, stepBack, stepForward };
}
