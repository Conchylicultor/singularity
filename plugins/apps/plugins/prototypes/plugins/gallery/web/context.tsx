import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import {
  prototypeUrl,
  resolvePicks,
  type OptionPicks,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { PrototypeStages, type PrototypeStageContribution } from "./slots";

/**
 * How long a picked option is remembered for a prototype on this device. A
 * preference, not a draft: long enough that coming back to a prototype next
 * month still shows the variant you left it on.
 */
const PICKS_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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
  /**
   * The option values picked for this prototype, as REMEMBERED — unjudged,
   * since the declaration they must match is not known here. Read them through
   * {@link usePrototypePicks}, never directly.
   */
  storedPicks: Readonly<Record<string, string>>;
  setPick: (option: string, value: string) => void;
  resetPicks: () => void;
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
  stageId,
  onStageChange,
  children,
}: {
  name: string;
  /** The stage the URL names, if it names one. */
  stageId: string | undefined;
  /** Pick a stage — the pane writes it into its URL. */
  onStageChange: (id: string) => void;
  children: ReactNode;
}) {
  const contributed = PrototypeStages.Stage.useContributions();
  const stages = useMemo(
    () => [...contributed].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [contributed],
  );

  // The id, not the stage: a URL's id survives the contribution list changing
  // under it, and one that does not resolve (no stage in the URL, a stage whose
  // plugin is gone, a typo) falls back to the first stage rather than leaving
  // the pane blank. Nothing here names a stage — which is what lets the default
  // be "whichever stage sorts first".
  const stage = stages.find((s) => s.id === stageId) ?? stages[0] ?? null;

  // Remembered per prototype on this device (localStorage), so a pick survives
  // leaving the pane and coming back — and, because it lives HERE rather than
  // inside the frame, it survives the reload every edit triggers.
  const [storedPicks, setStoredPicks, clearPicks] = useDraft<
    Record<string, string>
  >("prototype-options", {}, { scope: name, ttl: PICKS_TTL_MS });
  const setPick = useCallback(
    (option: string, value: string) =>
      setStoredPicks((prev) => ({ ...prev, [option]: value })),
    [setStoredPicks],
  );

  const value = useMemo<PrototypeDetailContextValue>(
    () => ({
      name,
      stages,
      stage,
      setStage: onStageChange,
      storedPicks,
      setPick,
      resetPicks: clearPicks,
    }),
    [name, stages, stage, onStageChange, storedPicks, setPick, clearPicks],
  );
  return (
    <PrototypeDetailContext.Provider value={value}>
      {children}
    </PrototypeDetailContext.Provider>
  );
}

/**
 * The picks that apply to `meta`: the remembered ones still valid against its
 * declaration, defaults left out (the page already carries them).
 */
export function usePrototypePicks(meta: PrototypeMeta): OptionPicks {
  const { storedPicks } = usePrototypeDetail();
  return useMemo(
    () => resolvePicks(meta.options, storedPicks),
    [meta.options, storedPicks],
  );
}

/**
 * THE url of the prototype's document as this pane shows it: its `index.html`,
 * cache-busted by `version` and carrying the picked options. Every frame of the
 * open prototype (Focus, Compare's mock half, Present) and the new-tab link go
 * through this, so none of them can show a different variant from the others.
 */
export function usePrototypeSrc(meta: PrototypeMeta, version: number): string {
  const picks = usePrototypePicks(meta);
  return prototypeUrl(meta.name, { v: version, picks });
}
