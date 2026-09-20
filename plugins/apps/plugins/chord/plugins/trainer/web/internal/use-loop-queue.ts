import { useEffect, useMemo, useState } from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  findLoopsEndpoint,
  type ChordToken,
  type IndexStatus,
  type LoopCandidate,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import type { ChordProgress } from "@plugins/apps/plugins/chord/plugins/progress/core";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { weakestChord } from "../../core";

/** How many loops one query asks for. */
const BATCH = 10;
/** The sections of this many most recent loops are left out of the next query. */
const RECENT_SECTIONS = 20;

/**
 * One queued loop, with the chord the batch it came from was asked for.
 *
 * The target travels WITH the loop because the round asks about it: the boxes
 * the learner must name are the target's, early on and whenever the target is
 * still fresh. Re-reading the weakest chord when the round is built would name
 * a chord this loop was never chosen for — the progress moves between the
 * query and the round.
 */
export type QueuedLoop = { loop: LoopCandidate; target: ChordToken };

/** What the trainer can show where the loop goes. */
export type LoopQueueState =
  /** The first batch is on its way (or the target is not known yet). */
  | { kind: "loading" }
  | { kind: "ready"; loop: LoopCandidate; target: ChordToken }
  /** The index answered that it is not ready — the gate above should prevent it. */
  | { kind: "not-ready"; status: IndexStatus }
  /** The index is ready and no loop fits the unlocked chords (and target). */
  | { kind: "empty" }
  | { kind: "error"; message: string };

export type LoopQueue = {
  state: LoopQueueState;
  /** Drop the current loop and move to the next one. */
  next: () => void;
  /** Drop the current loop and every queued loop on `videoId` (it cannot play). */
  skipVideo: (videoId: string) => void;
  /** Ask again after `empty`, `not-ready` or `error`. */
  retry: () => void;
};

type SectionId = LoopCandidate["sectionId"];

/** A loop's identity: its section, shape and first beat. */
export function loopKey(loop: LoopCandidate): string {
  return `${loop.sectionId}:${loop.window.shape}:${loop.window.startBeat}`;
}

type Fetch =
  /** Free to ask when the queue runs low. */
  | { kind: "idle" }
  /** The last answer added nothing: wait for the queue to run out, then say so. */
  | { kind: "exhausted" }
  | { kind: "not-ready"; status: IndexStatus }
  | { kind: "error"; message: string };

const IDLE: Fetch = { kind: "idle" };

/**
 * The palette a batch was drawn from, as one comparable string: the unlocked
 * chords and the key modes, sorted. Compared by value and not by array
 * identity, so a render that rebuilds the same set changes nothing.
 */
function paletteKey(
  unlocked: readonly ChordToken[],
  modes: readonly HookpadMode[],
): string {
  return `${[...unlocked].sort().join(",")}|${[...modes].sort().join(",")}`;
}

/** The queued loops and the last query's outcome, stamped with their palette. */
type Batch = {
  palette: string;
  loops: readonly QueuedLoop[];
  fetch: Fetch;
};

/**
 * The batch as it stands for the palette now in force.
 *
 * **A new palette makes the waiting loops stale.** They were chosen from the
 * chords the learner had before, so after unlocking one they would keep
 * playing the old set for a whole batch — the opposite of what taking a step
 * promises. Everything behind the loop on screen goes, and a fresh query runs
 * at once. The loop on screen stays: the learner may be halfway through
 * answering it, and pulling the song out from under them is its own bug.
 *
 * The last query's outcome goes with them — a palette that just grew may well
 * have loops the old one had none of, so `exhausted` and `error` must not
 * carry over.
 *
 * **A palette that SHRANK takes the loop on screen too.** Undoing a step gives
 * back a chord the learner no longer has, and the round on screen may be built
 * on exactly that chord — it was very likely chosen for it. Keeping it would
 * ask them to name a chord that is no longer theirs, so a round the new
 * palette cannot hold goes with the rest.
 *
 * This is DERIVED, never written: there is no render in which a stale loop
 * could be shown, and nothing to keep in step.
 */
function liveBatch(
  batch: Batch,
  palette: string,
  unlocked: ReadonlySet<ChordToken>,
): { loops: readonly QueuedLoop[]; fetch: Fetch } {
  if (batch.palette === palette) {
    return { loops: batch.loops, fetch: batch.fetch };
  }
  const current = batch.loops[0];
  const keep = current !== undefined && playableNow(current, unlocked);
  return { loops: keep ? [current] : [], fetch: IDLE };
}

/** Whether this loop is still one the learner may be asked: every chord it holds, and the chord it practises, are unlocked. */
function playableNow(
  queued: QueuedLoop,
  unlocked: ReadonlySet<ChordToken>,
): boolean {
  return (
    unlocked.has(queued.target) &&
    queued.loop.window.chordTokens.every((token) => unlocked.has(token))
  );
}

/**
 * The trainer's small queue of loops (plan "How a round works", step 1).
 *
 * The first loop is the one on screen. When it is the last one left, the
 * next batch is asked for (`POST /api/chord/loops/find`, 10 at a time): every
 * chord in `unlocked`, in one of `modes`, holding the target chord, and
 * leaving out the sections of the last 20 loops moved past and of the loops
 * still queued. So moving on is instant while the query runs.
 *
 * The target is the learner's weakest unlocked chord (`weakestChord`), read
 * from `progress` at the moment a batch is asked for — so each batch follows
 * the learner. Nothing is asked while `progress` has not loaded. Each queued
 * loop keeps the target its batch was asked for, so the round asks about the
 * chord the loop was actually chosen for.
 *
 * Unlocking a chord (or a key mode) drops the loops still waiting and asks
 * again straight away, so the new chord arrives on the very next song — see
 * `liveBatch`. What the learner has already played is remembered across the
 * change, so the next query still avoids the sections they just heard.
 */
export function useLoopQueue(opts: {
  unlocked: readonly ChordToken[];
  modes: readonly HookpadMode[];
  progress: ResourceResult<ChordProgress>;
}): LoopQueue {
  const { unlocked, modes, progress } = opts;
  const palette = paletteKey(unlocked, modes);
  const paletteRef = useLatestRef(palette);
  // The same set, for the one question `liveBatch` asks of it: is this loop
  // still one the learner may be shown? The ref is what the callbacks read,
  // since a write can land after the palette has moved again.
  const unlockedSet = useMemo(() => new Set(unlocked), [unlocked]);
  const unlockedRef = useLatestRef(unlockedSet);
  const [batch, setBatch] = useState<Batch>(() => ({
    palette,
    loops: [],
    fetch: IDLE,
  }));
  /** Sections of the loops moved past this session, most recent last. */
  const [played, setPlayed] = useState<readonly SectionId[]>([]);

  const { loops: queue, fetch: fetchState } = liveBatch(
    batch,
    palette,
    unlockedSet,
  );

  const find = useEndpointMutation(findLoopsEndpoint, {
    // Shown in place, with Retry — not as a toast on top of it.
    meta: { suppressError: true },
  });
  const { mutate, isPending } = find;

  const wantsMore = fetchState.kind === "idle" && queue.length <= 1;

  useEffect(() => {
    if (!wantsMore || isPending) return;
    // The target is not known until the progress has loaded.
    if (progress.pending) return;
    const askedFor = palette;
    const target = weakestChord(unlocked, progress.data.chords);
    const exclude = [
      ...new Set([
        ...played.slice(-RECENT_SECTIONS),
        ...queue.map((q) => q.loop.sectionId),
      ]),
    ];
    mutate(
      {
        body: {
          unlocked: [...unlocked],
          target,
          shape: "bars-4",
          modes: [...modes],
          ...(exclude.length > 0 ? { excludeSectionIds: exclude } : {}),
          limit: BATCH,
        },
      },
      {
        onSuccess: (res) => {
          // These loops were drawn from the palette in force when the query
          // went out. If the learner unlocked something while it was on its
          // way, they are already stale and the effect asks again — keeping
          // them would put back exactly what the unlock dropped.
          if (paletteRef.current !== askedFor) return;
          if (res.kind === "not-ready") {
            setBatch((b) => ({
              palette: askedFor,
              loops: liveBatch(b, askedFor, unlockedRef.current).loops,
              fetch: { kind: "not-ready", status: res.status },
            }));
            return;
          }
          setBatch((b) => {
            const live = liveBatch(b, askedFor, unlockedRef.current);
            const known = new Set(live.loops.map((e) => loopKey(e.loop)));
            const fresh = res.candidates
              .filter((c) => !known.has(loopKey(c)))
              .map((loop) => ({ loop, target }));
            return {
              palette: askedFor,
              loops: [...live.loops, ...fresh],
              fetch:
                res.candidates.length === 0
                  ? { kind: "exhausted" }
                  : live.fetch,
            };
          });
        },
        onError: (err) => {
          if (paletteRef.current !== askedFor) return;
          setBatch((b) => ({
            palette: askedFor,
            loops: liveBatch(b, askedFor, unlockedRef.current).loops,
            fetch: { kind: "error", message: err.message },
          }));
        },
      },
    );
    // `isPending` gates a second ask while one is out; the queue growing (or
    // the fetch state leaving `idle`) turns `wantsMore` off when it lands.
  }, [
    wantsMore,
    isPending,
    progress,
    unlocked,
    modes,
    palette,
    paletteRef,
    played,
    queue,
    mutate,
  ]);

  const current = queue[0];

  /**
   * Change the loops or the outcome. The palette in force is stamped on for
   * the caller, and the stale-drop is applied before their change, so a write
   * can never put back a loop the palette has just invalidated.
   */
  type Live = { loops: readonly QueuedLoop[]; fetch: Fetch };
  const commit = useEventCallback((fn: (live: Live) => Live) =>
    setBatch((b) => ({
      palette: paletteRef.current,
      ...fn(liveBatch(b, paletteRef.current, unlockedRef.current)),
    })),
  );

  const next = useEventCallback(() => {
    if (current === undefined) return;
    setPlayed((p) => [...p, current.loop.sectionId].slice(-RECENT_SECTIONS));
    commit((live) => ({ ...live, loops: live.loops.slice(1) }));
  });

  const skipVideo = useEventCallback((videoId: string) => {
    if (current !== undefined) {
      setPlayed((p) => [...p, current.loop.sectionId].slice(-RECENT_SECTIONS));
    }
    commit((live) => ({
      ...live,
      loops: live.loops.slice(1).filter((e) => e.loop.videoId !== videoId),
    }));
  });

  const retry = useEventCallback(() =>
    commit((live) => ({ ...live, fetch: IDLE })),
  );

  return { state: stateOf(current, fetchState), next, skipVideo, retry };
}

function stateOf(
  current: QueuedLoop | undefined,
  fetchState: Fetch,
): LoopQueueState {
  if (current !== undefined) {
    return { kind: "ready", loop: current.loop, target: current.target };
  }
  switch (fetchState.kind) {
    case "idle":
      return { kind: "loading" };
    case "exhausted":
      return { kind: "empty" };
    case "not-ready":
      return { kind: "not-ready", status: fetchState.status };
    case "error":
      return { kind: "error", message: fetchState.message };
  }
}
