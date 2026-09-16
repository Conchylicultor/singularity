import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import {
  applyPicksChange,
  prototypePicksResource,
  prototypeUrl,
  prototypeVersionUrl,
  resolvePicks,
  setPrototypePicks,
  type OptionPicks,
  type PicksChange,
  type PrototypeMeta,
  type PrototypeOption,
  type PrototypeVersion,
  type StoredPicks,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { PrototypeStages, type PrototypeStageContribution } from "./slots";

/** A contributed stage as the pane reads it back: renderable only via `renderIsolated`. */
export type PrototypeStage = SealContributions<PrototypeStageContribution>;

/**
 * Something derived from the picks: not known yet (still loading, or the load
 * failed — `error` says which), or known. The picks are the user's choice, so
 * while they are unknown there is nothing to stand in for them — the defaults
 * would be a claim about what the user picked, reversed a moment later. A
 * readiness gate (`matchResource`, `useCombinedResources`) takes it as is.
 */
export type PicksRead<T> =
  { pending: true; error: Error | null } | { pending: false; data: T };

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
   * The option values picked for this prototype, as STORED — the one shared
   * record every surface reads (`prototypes.picks`), with this pane's own
   * not-yet-confirmed changes already applied. Unjudged, since the declaration
   * they must match is not known here: read them through
   * {@link usePrototypePicks}, never directly.
   */
  picks: PicksRead<StoredPicks>;
  setPick: (option: string, value: string) => void;
  resetPicks: () => void;
  /**
   * The recorded version the pane is showing — `null` for the live folder.
   * Every frame of the open prototype follows it (through
   * {@link usePrototypeSrc}), and so does the options picker, which offers
   * the options THAT version declares. Held whole rather than as a sha: a
   * version never changes, so its options are known the moment it is picked
   * and stepping never waits on a lookup. Belongs to one prototype: opening
   * another one shows that one live.
   */
  shownVersion: PrototypeVersion | null;
  /** Show a recorded version, or the live folder (`null`). */
  showVersion: (version: PrototypeVersion | null) => void;
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

  // ONE shared record per prototype (`_picks/<id>.json` on the server), so the
  // variant picked here is the variant main, every worktree deploy, every
  // browser and the agents' CLI see — live. Living outside the frame is what
  // makes a pick survive the reload every edit triggers.
  //
  // Optimistic, so a chip answers the click at once; a failed write keeps the
  // pick on screen and shows in the sync-status cloud (never-revert). Coarse
  // confirmation: a pick is one small record with no identity worth matching,
  // and the first push after the write IS the record as the server now holds
  // it — including a pick made meanwhile somewhere else, which then wins.
  const params = useMemo(() => ({ name }), [name]);
  const stored = useOptimisticResource<
    StoredPicks,
    PicksChange,
    { name: string }
  >({
    resource: prototypePicksResource,
    params,
    apply: applyPicksChange,
    mutate: (change) =>
      fetchEndpoint(setPrototypePicks, { name }, { body: change }),
    label: "prototype options",
    describeOp: (change) =>
      change.kind === "reset" ? "reset" : `${change.option}=${change.value}`,
  });
  const picks = useMemo<PicksRead<StoredPicks>>(
    () =>
      stored.pending
        ? { pending: true, error: stored.error }
        : { pending: false, data: stored.data },
    [stored.pending, stored.error, stored.data],
  );
  const { dispatch } = stored;
  const setPick = useCallback(
    (option: string, value: string) => {
      dispatch({ kind: "set", option, value });
    },
    [dispatch],
  );
  const resetPicks = useCallback(() => {
    dispatch({ kind: "reset" });
  }, [dispatch]);

  // Held WITH the prototype it belongs to, so switching prototype shows the
  // new one live without an effect resetting anything: a version recorded for
  // another name simply does not apply here. Not remembered across visits —
  // an old version is something you look at, not a place the pane reopens on.
  const [shown, setShown] = useState<{
    name: string;
    version: PrototypeVersion;
  } | null>(null);
  const shownVersion = shown?.name === name ? shown.version : null;
  const showVersion = useCallback(
    (version: PrototypeVersion | null) =>
      setShown(version === null ? null : { name, version }),
    [name],
  );

  const value = useMemo<PrototypeDetailContextValue>(
    () => ({
      name,
      stages,
      stage,
      setStage: onStageChange,
      picks,
      setPick,
      resetPicks,
      shownVersion,
      showVersion,
    }),
    [
      name,
      stages,
      stage,
      onStageChange,
      picks,
      setPick,
      resetPicks,
      shownVersion,
      showVersion,
    ],
  );
  return (
    <PrototypeDetailContext.Provider value={value}>
      {children}
    </PrototypeDetailContext.Provider>
  );
}

/**
 * The options of the document on screen: the shown version's own declaration,
 * or — on the live folder — the live page's (`meta`). Never today's options
 * over an old version: one it has since dropped is still pickable there, and
 * one it has since gained would pick nothing.
 */
export function usePrototypeOptions(
  meta: PrototypeMeta,
): readonly PrototypeOption[] {
  const { shownVersion } = usePrototypeDetail();
  return shownVersion?.options ?? meta.options;
}

/**
 * The picks that apply to the document on screen: the stored ones still valid
 * against ITS declaration ({@link usePrototypeOptions}), defaults left out (the
 * page already carries them). One record per prototype, judged per document —
 * so a palette picked on v3 carries to the live page when it still has that
 * palette, and is simply not applied where it does not. Pending until the
 * record is known.
 */
export function usePrototypePicks(meta: PrototypeMeta): PicksRead<OptionPicks> {
  const { picks } = usePrototypeDetail();
  const options = usePrototypeOptions(meta);
  return useMemo<PicksRead<OptionPicks>>(
    () =>
      picks.pending
        ? picks
        : { pending: false, data: resolvePicks(options, picks.data) },
    [options, picks],
  );
}

/**
 * THE url of the prototype's document as this pane shows it. Every frame of the
 * open prototype (Focus, Compare's mock half, Present) and the new-tab link go
 * through this, so none of them can show a different variant — or a different
 * version — from the others.
 *
 * - live (no version picked): its `index.html`, cache-busted by `version` and
 *   carrying the picked options.
 * - a recorded version: that version's frozen document, carrying the picks
 *   valid against the options THAT version declares. No cache-bust, since a
 *   sha addresses content that never changes.
 *
 * Pending while the picks are: a URL built without them would open a variant
 * the user did not pick, and then swap to theirs.
 */
export function usePrototypeSrc(
  meta: PrototypeMeta,
  version: number,
): PicksRead<string> {
  const { shownVersion } = usePrototypeDetail();
  const picks = usePrototypePicks(meta);
  return useMemo<PicksRead<string>>(() => {
    if (picks.pending) return picks;
    const src =
      shownVersion === null
        ? prototypeUrl(meta.name, { v: version, picks: picks.data })
        : prototypeVersionUrl(meta.name, shownVersion.sha, {
            picks: picks.data,
          });
    return { pending: false, data: src };
  }, [meta.name, version, shownVersion, picks]);
}
