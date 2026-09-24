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
import {
  readDraft,
  writeDraft,
  type DraftOptions,
} from "@plugins/primitives/plugins/persistent-draft/web";
import { isEmbeddedDocument } from "@plugins/primitives/plugins/embed/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import {
  applyPicksChange,
  DEFAULT_PROTOTYPE_VIEWPORT,
  prototypesResource,
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
  type PrototypeViewport,
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
import { restoreCanvas, serializeCanvas } from "./internal/saved-canvas";
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

/**
 * Where a remembered canvas is saved: this browser TAB's sessionStorage, one
 * entry per pane instance and prototype. A reload reopens it; closing the tab
 * throws it away — a comparison is a throwaway, never carried to a new session.
 * Held for as long as the tab lives, however long that is.
 */
const SAVED_CANVAS: DraftOptions = {
  storage: "session",
  ttl: Number.POSITIVE_INFINITY,
};
const SAVED_CANVAS_KEY = "prototypes.canvas";

/**
 * The canvas saved under `slot` in this tab, or a fresh one at `size` — the
 * size the prototype declares.
 */
function openCanvas(slot: string, size: PrototypeViewport): CanvasState {
  const raw = readDraft<unknown>(SAVED_CANVAS_KEY, {
    ...SAVED_CANVAS,
    scope: slot,
  });
  if (raw === null) return initialCanvasState({ size });
  const restored = restoreCanvas(raw);
  if (restored.kind === "restored") return restored.state;
  // Written by an older shape of the canvas: open fresh, and say why.
  console.warn(`Saved canvas ${slot} not reopened: ${restored.reason}`);
  return initialCanvasState({ size });
}

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

/** The canvas as the provider holds it: for one prototype, in one saved slot. */
interface Held {
  name: string;
  /** Where it is saved (`<pane instance>:<prototype>`), or `null` when it is not. */
  slot: string | null;
  state: CanvasState;
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

interface PrototypeDetailProviderProps {
  name: string;
  /**
   * The pane instance to remember the canvas for (the pane's route-entry
   * `uuid`, which a reload restores): every change is saved under it in this
   * browser tab, and a reload reopens it. A new pane instance — another app tab,
   * another browser tab, a new visit — starts fresh at frame A. Omitted by a
   * surface that shows one given frame (Present's new-tab page), and ignored
   * inside an embedded document, so a framed copy of the app never writes.
   */
  remember?: string;
  /** The version frame A opens on — `null` (the default) for the live folder. Not with `remember`. */
  initialVersion?: PrototypeVersion | null;
  /**
   * Picks of frame A's OWN, instead of the shared record — for a surface that
   * shows one frame someone else had given local picks (Present's new-tab page).
   * Not with `remember`.
   */
  initialPicks?: StoredPicks;
  children: ReactNode;
}

/**
 * The canvas for one prototype. A fresh canvas opens at the size the prototype
 * declares (`<meta name="prototype-viewport">`), so the provider waits for the
 * prototype list before the canvas exists at all — a canvas at a stand-in size
 * would be a claim about the prototype that reverses itself. A prototype the
 * list does not have opens at the default (the pane then says "not found").
 */
export function PrototypeDetailProvider(
  props: PrototypeDetailProviderProps,
): ReactNode {
  const { name } = props;
  const select = useCallback(
    (rows: readonly PrototypeMeta[]): PrototypeViewport =>
      rows.find((p) => p.name === name)?.viewport ?? DEFAULT_PROTOTYPE_VIEWPORT,
    [name],
  );
  // `gate`: this read decides whether the canvas exists, so its settle must
  // re-render even when the slice equals the initial one.
  const declared = useResource(prototypesResource, undefined, {
    select,
    gate: true,
  });
  return matchResource(declared, {
    pending: () => <Loading variant="block" />,
    error: () => <Loading variant="block" />,
    ready: (size) => <DetailProvider {...props} size={size} />,
  });
}

function DetailProvider({
  name,
  size,
  remember,
  initialVersion = null,
  initialPicks,
  children,
}: PrototypeDetailProviderProps & { size: PrototypeViewport }) {
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

  // The canvas belongs to ONE prototype in ONE pane instance: held with both,
  // so opening another opens its own canvas without an effect resetting
  // anything. The prototype is part of the slot because a pane instance can be
  // pointed at another prototype in place. A saved canvas is read synchronously
  // here, so the first paint is already it rather than the defaults swapped out
  // a moment later.
  const slot =
    remember !== undefined && !isEmbeddedDocument()
      ? `${remember}:${name}`
      : null;
  const open = (): Held => ({
    name,
    slot,
    state:
      slot !== null
        ? openCanvas(slot, size)
        : initialCanvasState({
            size,
            version: initialVersion,
            picks: initialPicks ?? "shared",
          }),
  });
  const [held, setHeld] = useState<Held>(open);
  let current = held;
  if (held.name !== name || held.slot !== slot) {
    // Another prototype or pane instance: its canvas, set during render
    // (React's "adjust state on a prop change" pattern) rather than by an
    // effect after paint.
    current = open();
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
    setHeld({ name, slot, state });
    if (slot !== null) {
      writeDraft(SAVED_CANVAS_KEY, serializeCanvas(state), {
        ...SAVED_CANVAS,
        scope: slot,
      });
    }
    for (const effect of effects) runEffect(effect);
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
