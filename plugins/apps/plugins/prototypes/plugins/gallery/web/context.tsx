import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { PrototypeStages, type PrototypeStageContribution } from "./slots";

/** A contributed stage as the pane reads it back: renderable only via `renderIsolated`. */
export type PrototypeStage = SealContributions<PrototypeStageContribution>;

export interface PrototypeDetailContextValue {
  /** The directory slug of the prototype this pane is showing. */
  name: string;
  /** Every contributed stage, in switcher order. */
  stages: PrototypeStage[];
  /**
   * The stage the pane is painting — `null` only if nothing contributes one,
   * which cannot happen while this plugin is loaded (it contributes two).
   */
  stage: PrototypeStage | null;
  setStage: (id: string) => void;
}

const PrototypeDetailContext =
  createContext<PrototypeDetailContextValue | null>(null);

/**
 * Shared state for the detail pane's surface. Lifted out of the pane body so the
 * header controls can be zero-prop contributions to `prototypeDetailPane.Actions`
 * (the stage switcher lives in the header, the stage it switches lives in the
 * body) — the same lift Story's `useStoryEditor()` does for its toolbar.
 */
export function usePrototypeDetail(): PrototypeDetailContextValue {
  const ctx = useContext(PrototypeDetailContext);
  if (!ctx) {
    throw new Error(
      "usePrototypeDetail must be used within a PrototypeDetailProvider",
    );
  }
  return ctx;
}

export function PrototypeDetailProvider({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const contributed = PrototypeStages.Stage.useContributions();
  const stages = useMemo(
    () => [...contributed].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [contributed],
  );

  // The id, not the stage: a picked id survives the contribution list changing
  // under it, and an id that no longer resolves falls back to the first stage
  // rather than leaving the pane blank. Nothing here names a stage — which is
  // what lets the default be "whichever stage sorts first".
  const [pickedId, setPickedId] = useState<string | null>(null);
  const stage = stages.find((s) => s.id === pickedId) ?? stages[0] ?? null;

  const value = useMemo<PrototypeDetailContextValue>(
    () => ({ name, stages, stage, setStage: setPickedId }),
    [name, stages, stage],
  );
  return (
    <PrototypeDetailContext.Provider value={value}>
      {children}
    </PrototypeDetailContext.Provider>
  );
}
