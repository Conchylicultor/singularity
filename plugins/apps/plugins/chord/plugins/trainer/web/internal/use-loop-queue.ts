import { useCallback, useEffect, useState } from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  findLoopsEndpoint,
  type ChordToken,
  type IndexStatus,
  type LoopCandidate,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import type { ChordProgress } from "@plugins/apps/plugins/chord/plugins/progress/core";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { weakestChord } from "../../core";

/** How many loops one query asks for. */
const BATCH = 10;
/** The sections of this many most recent loops are left out of the next query. */
const RECENT_SECTIONS = 20;

/** What the trainer can show where the loop goes. */
export type LoopQueueState =
  /** The first batch is on its way (or the target is not known yet). */
  | { kind: "loading" }
  | { kind: "ready"; loop: LoopCandidate }
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
 * the learner. Nothing is asked while `progress` has not loaded.
 */
export function useLoopQueue(opts: {
  unlocked: readonly ChordToken[];
  modes: readonly HookpadMode[];
  progress: ResourceResult<ChordProgress>;
}): LoopQueue {
  const { unlocked, modes, progress } = opts;
  const [queue, setQueue] = useState<readonly LoopCandidate[]>([]);
  /** Sections of the loops moved past this session, most recent last. */
  const [played, setPlayed] = useState<readonly SectionId[]>([]);
  const [fetchState, setFetchState] = useState<Fetch>({ kind: "idle" });

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
    const target = weakestChord(unlocked, progress.data.chords);
    const exclude = [
      ...new Set([
        ...played.slice(-RECENT_SECTIONS),
        ...queue.map((c) => c.sectionId),
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
          if (res.kind === "not-ready") {
            setFetchState({ kind: "not-ready", status: res.status });
            return;
          }
          setQueue((q) => {
            const known = new Set(q.map(loopKey));
            const fresh = res.candidates.filter((c) => !known.has(loopKey(c)));
            return fresh.length === 0 ? q : [...q, ...fresh];
          });
          if (res.candidates.length === 0) setFetchState({ kind: "exhausted" });
        },
        onError: (err) =>
          setFetchState({ kind: "error", message: err.message }),
      },
    );
    // `isPending` gates a second ask while one is out; the queue growing (or
    // the fetch state leaving `idle`) turns `wantsMore` off when it lands.
  }, [wantsMore, isPending, progress, unlocked, modes, played, queue, mutate]);

  const current = queue[0];

  const next = useCallback(() => {
    if (current === undefined) return;
    setPlayed((p) => [...p, current.sectionId].slice(-RECENT_SECTIONS));
    setQueue((q) => q.slice(1));
  }, [current]);

  const skipVideo = useCallback(
    (videoId: string) => {
      if (current !== undefined) {
        setPlayed((p) => [...p, current.sectionId].slice(-RECENT_SECTIONS));
      }
      setQueue((q) => q.slice(1).filter((c) => c.videoId !== videoId));
    },
    [current],
  );

  const retry = useCallback(() => setFetchState({ kind: "idle" }), []);

  return { state: stateOf(current, fetchState), next, skipVideo, retry };
}

function stateOf(
  current: LoopCandidate | undefined,
  fetchState: Fetch,
): LoopQueueState {
  if (current !== undefined) return { kind: "ready", loop: current };
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
