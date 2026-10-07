// The shadow audit's one decision, pure (status-shadow-audit.ts runs it each
// tick): given what the retired poller would write right now, which divergences
// were fixed by a push signal (late or on time), which only by the sweep (a
// MISSED signal), and which nobody has fixed (also missed).
//
// "Late" is not "missed": a 2 s threshold reported a signal-driven fix that
// took 2.2 s on a loaded host as a miss
// (research/2026-10-07-conversations-status-shadow-audit-retirement.md).

/** A divergence still being watched. */
export interface Divergence {
  signature: string;
  /** The tick it was first seen. */
  since: number;
  /** The last tick it was still seen — a signal reconcile after this fixed it. */
  lastSeen: number;
  /** Already reported as open; its resolution is not reported again. */
  reported: boolean;
}

export type AuditFinding =
  | {
      kind: "late";
      id: string;
      signature: string;
      divergedForMs: number;
    }
  | {
      kind: "missed";
      id: string;
      signature: string;
      divergedForMs: number;
      resolvedBy: "sweep" | "open";
    };

/** A divergence nothing has fixed for this long is a miss without waiting further (> one sweep). */
export const OPEN_MISS_MS = 90_000;

/**
 * A divergence gone within this long is not a finding, whichever path ended it:
 * a state that flickered back on its own needed no write.
 */
export const MIN_FINDING_MS = 2_000;

/**
 * One audit tick. `diverging` maps each conversation whose verdict differs from
 * its row to the stable signature of that difference; `lastSignalAt` is when a
 * signal-driven reconcile last ran for an id. Mutates `divergences` in place.
 */
export function auditStep(
  divergences: Map<string, Divergence>,
  diverging: ReadonlyMap<string, string>,
  lastSignalAt: (id: string) => number | undefined,
  now: number,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const resolve = (id: string, d: Divergence): void => {
    divergences.delete(id);
    if (d.reported) return;
    const divergedForMs = now - d.since;
    if (divergedForMs < MIN_FINDING_MS) return;
    const signal = lastSignalAt(id);
    if (signal !== undefined && signal > d.lastSeen) {
      findings.push({
        kind: "late",
        id,
        signature: d.signature,
        divergedForMs,
      });
    } else {
      findings.push({
        kind: "missed",
        id,
        signature: d.signature,
        divergedForMs,
        resolvedBy: "sweep",
      });
    }
  };

  for (const [id, d] of divergences) {
    const signature = diverging.get(id);
    // Gone, or now wanting something else: either way what it wanted landed.
    if (signature !== d.signature) resolve(id, d);
  }

  for (const [id, signature] of diverging) {
    const d = divergences.get(id);
    if (!d) {
      divergences.set(id, {
        signature,
        since: now,
        lastSeen: now,
        reported: false,
      });
      continue;
    }
    d.lastSeen = now;
    if (!d.reported && now - d.since >= OPEN_MISS_MS) {
      d.reported = true;
      findings.push({
        kind: "missed",
        id,
        signature,
        divergedForMs: now - d.since,
        resolvedBy: "open",
      });
    }
  }

  return findings;
}
