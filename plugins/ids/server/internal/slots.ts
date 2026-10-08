import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import { kindLabel, type AnyIdKind } from "../../core";

/** What one id names, answered on the server. A failed lookup THROWS. */
export type IdReferent = { found: true; title: string } | { found: false };

/**
 * The id-kind registry, server half — the twin of the web `IdKinds`.
 *
 * - `Kind` — one declared kind (`ids:kind-both-runtimes` keeps it registered
 *   on both runtimes).
 * - `Referent` — what a kind's id names: `resolve(id)` → its title, or not
 *   found. Optional per kind.
 */
export const IdKinds = {
  Kind: defineServerContribution<{ kind: AnyIdKind }>("ids.kind", {
    docLabel: (p) => kindLabel(p.kind),
  }),
  Referent: defineServerContribution<{
    kind: AnyIdKind;
    resolve(id: string): Promise<IdReferent>;
  }>("ids.referent", { docLabel: (p) => p.kind.prefix }),
};

/** Every registered id kind, read at CALL time (never cache: plugins register at boot). */
export function getIdKinds(): readonly AnyIdKind[] {
  return IdKinds.Kind.getContributions().map((c) => c.kind);
}
