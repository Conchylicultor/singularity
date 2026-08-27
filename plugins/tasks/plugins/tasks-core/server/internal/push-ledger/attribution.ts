/**
 * The ledger's SECOND input, and why the freshness memo has to see it.
 *
 * `reconcile` reads `main`'s history AND this database's conversation set: a
 * commit is attributable only once a conversation row carrying its id exists
 * here. `createGitStateMemo`'s contract is that the signature "must fingerprint
 * every input the result depends on" — signing on `main`'s tip alone left the
 * second input invisible, so a commit that an adoption had just made attributable
 * stayed deferred until `main` happened to move again. On a quiet repo that is an
 * unbounded wait for a fact that is already true.
 *
 * An in-process counter rather than a query: the signature is ungated and probed
 * on EVERY read, so it has to cost nothing, and every write to this database's
 * `conversations` table comes from this backend — one instance per user, one
 * backend per database fork. Over-counting is safe (one extra re-derivation);
 * under-counting is not, which is why the bump lives in the one insert funnel
 * (`mutations/conversations.ts`) rather than at each call site that inserts.
 */
let generation = 0;

/** Record that this database's attributable conversation set has changed. */
export function noteAttributionChanged(): void {
  generation += 1;
}

/** The current attribution generation, for the freshness signature to fold in. */
export function attributionGeneration(): number {
  return generation;
}
