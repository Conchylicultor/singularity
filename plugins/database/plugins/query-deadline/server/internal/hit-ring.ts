import type { QueryDeadlineHit } from "../../core";

/** The last `capacity` deadline hits, oldest first. */
export interface HitRing {
  push(hit: QueryDeadlineHit): void;
  /** A copy, oldest first — safe to hand to a loader that serializes it later. */
  snapshot(): QueryDeadlineHit[];
}

export function createHitRing(capacity: number): HitRing {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error(
      `createHitRing: capacity must be a positive integer, got ${capacity}`,
    );
  }
  const hits: QueryDeadlineHit[] = [];
  return {
    push(hit) {
      hits.push(hit);
      if (hits.length > capacity) hits.splice(0, hits.length - capacity);
    },
    snapshot() {
      return hits.slice();
    },
  };
}
