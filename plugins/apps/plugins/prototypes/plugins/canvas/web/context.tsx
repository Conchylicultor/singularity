import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
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
import {
  canvasReducer,
  initialCanvasState,
  picksOf,
  type CanvasAction,
  type CanvasEffect,
  type CanvasState,
  type FrameId,
  type PrototypeFrame,
} from "./internal/canvas-model";
import { FrameSource } from "./slots";

/**
 * Something derived from the shared picks: not known yet (still loading, or
 * the load failed — `error` says which), or known. The picks are the user's
 * choice, so while they are unknown there is nothing to stand in for them — the
 * defaults would be a claim about what the user picked, reversed a moment
 * later. A readiness gate (`matchResource`) takes it as is.
 */
export type PicksRead<T> =
  { pending: true; error: Error | null } | { pending: false; data: T };

/** A frame source as the header lists it. */
export interface CanvasSourceEntry {
  id: string;
  addLabel: string;
}

/** The URL `layout` part that means "the prototype beside a frame source". */
export const COMPARE_LAYOUT = "compare";

export interface PrototypeDetailContextValue {
  /** The directory slug of the prototype this pane is showing. */
  name: string;
  /**
   * The prototype's ONE shared picks record (`prototypes.picks`), with this
   * pane's own not-yet-confirmed changes applied. Frame A shows it. Unjudged —
   * read a frame's picks through {@link useFramePicks}.
   */
  shared: PicksRead<StoredPicks>;
  /** The canvas: frames, selection, size, zoom, layout. */
  canvas: CanvasState;
  /** The one way the canvas changes. */
  dispatch: (action: CanvasAction) => void;
  /** Close every frame but `id`, with an Undo toast. */
  keepOnly: (id: FrameId) => void;
  /** Every contributed frame source, in registration order. */
  sources: readonly CanvasSourceEntry[];
}

/** The canvas as the provider holds it: for one prototype. */
interface Held {
  name: string;
  state: CanvasState;
  /**
   * The URL asked for a source frame (`compare`) before any source was
   * contributed — the sources' plugins load in a later tier than this pane.
   * The first render that has one adds it.
   */
  awaitingSource: boolean;
}
const PrototypeDetailContext =
  createContext<PrototypeDetailContextValue | null>(null);

/**
 * The canvas state and the shared picks, for everything inside the detail pane
 * (its header actions included — the provider wraps `PaneChrome`) and for any
 * surface that mounts its own provider (Present's new-tab page).
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
  layout,
  onLayoutChange,
  initialVersion = null,
  initialPicks,
  children,
}: {
  name: string;
  /**
   * The coarse layout the URL names: `compare` opens frame A beside the first
   * contributed frame source. Read when the canvas opens (per prototype).
   */
  layout?: string;
  /**
   * Hear the coarse layout change — `compare` while a source frame is on the
   * canvas, `undefined` otherwise — so the pane writes it back to its URL.
   * Omitted by a surface with no URL to keep in step.
   */
  onLayoutChange?: (layout: string | undefined) => void;
  /** The version frame A opens on — `null` (the default) for the live folder. */
  initialVersion?: PrototypeVersion | null;
  /**
   * Picks of frame A's OWN, instead of the shared record — for a surface that
   * shows one frame someone else had given local picks (Present's new-tab page).
   */
  initialPicks?: StoredPicks;
  children: ReactNode;
}) {
  const contributed = FrameSource.useContributions();
  const sources = useMemo<CanvasSourceEntry[]>(
    () =>
      contributed.flatMap((c) =>
        typeof c.match === "string"
          ? [{ id: c.match, addLabel: c.addLabel }]
          : [],
      ),
    [contributed],
  );

  // ONE shared record per prototype (`_picks/<id>.json` on the server), so the
  // variant frame A shows is the variant main, every worktree deploy, every
  // browser and the agents' CLI see — live. Optimistic, so a chip answers the
  // click at once; a failed write keeps the pick on screen and shows in the
  // sync-status cloud (never-revert).
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
  const shared = useMemo<PicksRead<StoredPicks>>(
    () =>
      stored.pending
        ? { pending: true, error: stored.error }
        : { pending: false, data: stored.data },
    [stored.pending, stored.error, stored.data],
  );

  // The canvas belongs to ONE prototype: held with its name, so opening another
  // prototype opens a fresh canvas without an effect resetting anything. Not
  // remembered across visits — the URL's coarse layout is what reopens.
  const open = (): Held => {
    const wantsSource = layout === COMPARE_LAYOUT;
    const source = wantsSource ? sources[0]?.id : undefined;
    return {
      name,
      state: initialCanvasState({
        version: initialVersion,
        picks: initialPicks ?? "shared",
        source,
      }),
      awaitingSource: wantsSource && source === undefined,
    };
  };
  const [held, setHeld] = useState<Held>(open);
  let current = held;
  if (held.name !== name) {
    // Another prototype: a fresh canvas, set during render (React's "adjust
    // state on a prop change" pattern) rather than by an effect after paint.
    current = open();
    setHeld(current);
  } else if (held.awaitingSource && sources[0] !== undefined) {
    const added = canvasReducer(
      held.state,
      { type: "addSource", source: sources[0].id },
      {},
    ).state;
    current = {
      name,
      state: { ...added, selected: held.state.selected },
      awaitingSource: false,
    };
    setHeld(current);
  }
  const canvas = current.state;
  // The latest state a dispatch produced, and the rendered state it chained
  // from — two dispatches in one event must chain, not both start from the
  // render's snapshot. Once the next render lands, `from` no longer matches
  // and the rendered state is the truth again.
  const latest = useRef<{ from: object; state: CanvasState } | null>(null);

  const writeShared = stored.dispatch;
  const runEffect = useCallback(
    (effect: CanvasEffect) => {
      switch (effect.kind) {
        case "setShared":
          writeShared({
            kind: "set",
            option: effect.option,
            value: effect.value,
          });
          return;
        case "resetShared":
          writeShared({ kind: "reset" });
          return;
        case "replaceShared":
          writeShared({ kind: "reset" });
          for (const [option, value] of Object.entries(effect.picks)) {
            writeShared({ kind: "set", option, value });
          }
          return;
      }
    },
    [writeShared],
  );

  const currentState = (): CanvasState =>
    latest.current?.from === current ? latest.current.state : canvas;
  const sharedSnapshot = (): StoredPicks => (shared.pending ? {} : shared.data);

  const dispatch = useEventCallback((action: CanvasAction) => {
    const before = currentState();
    const { state, effects } = canvasReducer(before, action, sharedSnapshot());
    if (state === before && effects.length === 0) return;
    latest.current = { from: current, state };
    setHeld({ name, state, awaitingSource: false });
    for (const effect of effects) runEffect(effect);
    const had = before.frames.some((f) => f.kind === "source");
    const has = state.frames.some((f) => f.kind === "source");
    if (had !== has) onLayoutChange?.(has ? COMPARE_LAYOUT : undefined);
  });

  const keepOnly = useEventCallback((id: FrameId) => {
    const before = currentState();
    const snapshot = sharedSnapshot();
    const closed = before.frames.length - 1;
    if (closed < 1) return;
    dispatch({ type: "keepOnly", id });
    showToast({
      description: `Closed ${String(closed)} other frame${closed === 1 ? "" : "s"}`,
      action: {
        label: "Undo",
        onClick: () =>
          dispatch({ type: "restore", state: before, shared: snapshot }),
      },
    });
  });

  const value = useMemo<PrototypeDetailContextValue>(
    () => ({ name, shared, canvas, dispatch, keepOnly, sources }),
    [name, shared, canvas, dispatch, keepOnly, sources],
  );
  return (
    <PrototypeDetailContext.Provider value={value}>
      {children}
    </PrototypeDetailContext.Provider>
  );
}

/** The options `version` declares — the live page's (`meta`) for `null`. */
export function documentOptions(
  meta: PrototypeMeta,
  version: PrototypeVersion | null,
): readonly PrototypeOption[] {
  return version?.options ?? meta.options;
}

/**
 * The picks a prototype frame shows, as STORED: frame A's are the shared
 * record, every other frame's its own. Pending while the shared record is
 * unknown (every frame waits, so no frame opens on a guess).
 */
export function useFrameStoredPicks(
  frame: PrototypeFrame,
): PicksRead<StoredPicks> {
  const { shared } = usePrototypeDetail();
  return useMemo<PicksRead<StoredPicks>>(() => {
    if (frame.picks !== "shared") return { pending: false, data: frame.picks };
    return shared.pending ? shared : { pending: false, data: shared.data };
  }, [frame.picks, shared]);
}

/**
 * The picks that apply to a frame's document: its stored picks still valid
 * against THAT document's declaration (a recorded version's own options, or
 * the live page's), defaults left out.
 */
export function useFramePicks(
  frame: PrototypeFrame,
  meta: PrototypeMeta,
): PicksRead<OptionPicks> {
  const stored = useFrameStoredPicks(frame);
  const options = documentOptions(meta, frame.version);
  return useMemo<PicksRead<OptionPicks>>(
    () =>
      stored.pending
        ? stored
        : { pending: false, data: resolvePicks(options, stored.data) },
    [options, stored],
  );
}

/** Every prototype frame's stored picks, `"shared"` read from the record. */
export function useStoredPicksOf(): (frame: PrototypeFrame) => StoredPicks {
  const { shared } = usePrototypeDetail();
  return useCallback(
    // Before the record is known no frame renders its picks (every frame waits
    // on `useFramePicks`), so the empty stand-in here is never shown.
    (frame) => picksOf(frame, shared.pending ? {} : shared.data),
    [shared],
  );
}

/**
 * THE url of a prototype frame's document: its version under its picks.
 * Pending while its picks are unknown.
 */
export function useFrameSrc(
  frame: PrototypeFrame,
  meta: PrototypeMeta,
  cacheBust: number,
): PicksRead<string> {
  const stored = useFrameStoredPicks(frame);
  return useMemo<PicksRead<string>>(
    () =>
      stored.pending
        ? stored
        : {
            pending: false,
            data: prototypeDocumentSrc(
              meta,
              frame.version,
              cacheBust,
              stored.data,
            ),
          },
    [stored, meta, frame.version, cacheBust],
  );
}

/**
 * The url of one document of the prototype — `version`, or the live folder for
 * `null` — under `stored` picks, judged against the options THAT version
 * declares.
 *
 * - live: its `index.html`, cache-busted by `cacheBust` (the live
 *   `prototypesVersionResource` value), so an agent's edit reloads the frame.
 * - a recorded version: its frozen document. No cache-bust, since a sha
 *   addresses content that never changes.
 */
export function prototypeDocumentSrc(
  meta: PrototypeMeta,
  version: PrototypeVersion | null,
  cacheBust: number,
  stored: StoredPicks,
): string {
  const resolved = resolvePicks(documentOptions(meta, version), stored);
  return version === null
    ? prototypeUrl(meta.name, { v: cacheBust, picks: resolved })
    : prototypeVersionUrl(meta.name, version.sha, { picks: resolved });
}
