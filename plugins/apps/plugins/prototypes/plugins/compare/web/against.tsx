import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePrototypeDetail } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import type { CounterpartSpec } from "./types";

/** The Compare stage's id — its chip in the switcher, and its URL segment. */
export const COMPARE_STAGE_ID = "compare";

export interface CompareAgainst {
  /**
   * The counterpart the reader picked for this prototype — `null` to compare
   * against what the prototype declares it mocks.
   */
  picked: CounterpartSpec | null;
  /** Pick a counterpart, or `null` to go back to the declared one. */
  setPicked: (spec: CounterpartSpec | null) => void;
  /** Pick a counterpart AND switch the pane to the Compare stage. */
  compareAgainst: (spec: CounterpartSpec) => void;
}

const CompareAgainstContext = createContext<CompareAgainst | null>(null);

/**
 * What the Compare stage compares against, for the one detail pane it wraps
 * (a `PrototypeDetailScope` contribution, so the header, the version list's
 * row actions and the stage all read the same one).
 *
 * Held WITH the prototype it was picked for, like the pane's shown version: a
 * pick made on one prototype does not follow the reader to another, with no
 * effect resetting anything. Not in the URL — the pane's route has one
 * optional part, the stage — and not remembered: like an old version, a
 * comparison is something you look at, not a place the pane reopens on.
 */
export function CompareAgainstProvider({ children }: { children: ReactNode }) {
  const { name, setStage } = usePrototypeDetail();
  const [held, setHeld] = useState<{
    name: string;
    spec: CounterpartSpec;
  } | null>(null);
  const picked = held?.name === name ? held.spec : null;
  const setPicked = useCallback(
    (spec: CounterpartSpec | null) =>
      setHeld(spec === null ? null : { name, spec }),
    [name],
  );
  const compareAgainst = useCallback(
    (spec: CounterpartSpec) => {
      setPicked(spec);
      setStage(COMPARE_STAGE_ID);
    },
    [setPicked, setStage],
  );
  const value = useMemo(
    () => ({ picked, setPicked, compareAgainst }),
    [picked, setPicked, compareAgainst],
  );
  return (
    <CompareAgainstContext.Provider value={value}>
      {children}
    </CompareAgainstContext.Provider>
  );
}

/** What the open prototype's Compare stage compares against, and how to change it. */
export function useCompareAgainst(): CompareAgainst {
  const ctx = useContext(CompareAgainstContext);
  if (!ctx) {
    throw new Error(
      "useCompareAgainst must be used within a prototype detail pane",
    );
  }
  return ctx;
}
