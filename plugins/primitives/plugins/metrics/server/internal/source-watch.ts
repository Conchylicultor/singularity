import type { SourceImpl } from "./contribution";

// What makes a source's numbers stale is the source's own `changes` (a change
// feed, a git ref, a refresh job), and every served query and drill-down page
// of the source must hear it. One `changes` subscription per source, however
// many tuples watch it: the first `acquire` starts it, each change fans out to
// every acquirer's `notify`, and the last release stops it — so nothing
// watches a source no tab reads.

export interface SourceWatch {
  /**
   * Hear `sourceId`'s changes until the returned release runs. A source with
   * no `changes` never changes on its own: nothing is watched, and the release
   * is a no-op.
   */
  acquire(sourceId: string, notify: () => void): () => void;
}

interface Watched {
  listeners: Set<() => void>;
  stop: () => void;
}

/** A hub over the sources `sourceOf` resolves (it throws on an unknown id). */
export function createSourceWatch(
  sourceOf: (sourceId: string) => SourceImpl,
): SourceWatch {
  const watched = new Map<string, Watched>();
  return {
    acquire(sourceId, notify) {
      let w = watched.get(sourceId);
      if (w === undefined) {
        const { changes } = sourceOf(sourceId);
        if (changes === undefined) return () => {};
        const listeners = new Set<() => void>();
        const stop = changes(() => {
          // A copy: a listener's notify may release (and so mutate) the set.
          for (const listener of [...listeners]) listener();
        });
        w = { listeners, stop };
        watched.set(sourceId, w);
      }
      const held = w;
      // One entry per acquire, so the same notify acquired twice is two holds.
      const listener = () => notify();
      held.listeners.add(listener);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        held.listeners.delete(listener);
        if (held.listeners.size > 0) return;
        watched.delete(sourceId);
        held.stop();
      };
    },
  };
}
