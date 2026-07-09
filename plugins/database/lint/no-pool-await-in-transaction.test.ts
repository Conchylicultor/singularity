/**
 * Tests for the `no-pool-await-in-transaction` lint rule. Run with `bun test`.
 *
 * The valid/invalid lists are the audited real call sites from
 * research/2026-07-09-global-interactive-lane-origin-based-db-gating.md § Task 5:
 * every legitimate executor-threading shape must pass, and the three known
 * pool-inside-transaction shapes must fail.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-pool-await-in-transaction";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

/** Wrap a statement body in the transaction callback under test. */
const tx = (body: string) => `await db.transaction(async (tx) => { ${body} });`;

// `RuleTester.run` drives the harness itself (it calls the ambient describe/it
// that bun:test provides), so it must run at module top level.
ruleTester.run(
  "no-pool-await-in-transaction",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // --- Audited legitimate sites: the executor is threaded. ---
      { code: tx(`await insertForest(tx, { rootId, blocks });`) }, // page/editor
      { code: tx(`await computePageId(root.parentId, tx);`) }, // page/editor
      { code: tx(`await nextRankIn(_conversationGroups, tx);`) }, // conversations/grouped
      { code: tx(`await ensureChangelogTable(tx);`) }, // change-feed
      { code: tx(`await rebuildDerivedViews(tx);`) }, // migrations runner
      { code: tx(`await tx.insert(t).values(v).onConflictDoUpdate({ target: t.id });`) }, // slow-ops
      { code: tx(`await store.run(batch, () => fn(tx));`) }, // tasks-core status-batch
      {
        // tasks-core withTaskStatusBatch: the executor rides inside `batch`.
        code: tx(
          `const batch = { tx, before: new Map() };` +
            `const result = await store.run(batch, () => fn(tx));` +
            `await flushStatusBatch(batch);`,
        ),
      },
      { code: tx("await tx.execute(sql`delete from jobs`);") }, // dead-job-gc

      // --- Other shapes the executor reaches. ---
      // Long member chain rooted at the executor.
      { code: tx(`await tx.select().from(tasks).where(eq(tasks.id, id));`) },
      // Options-object property (`{ tx: batch.tx }` — tasks-core status events).
      { code: tx(`await taskStatusChanged.emit(payload, { tx: batch.tx });`) },
      // Shorthand property.
      { code: tx(`await emit(payload, { tx });`) },
      // Non-async callback returning a promise chain.
      { code: `db.transaction((tx) => insertForest(tx, { rootId }));` },
      // Awaiting a non-call expression is out of scope — the rule bans pool CALLS.
      { code: tx(`await pending;`) },
      // A nested transaction rebinds the executor; the inner callback is judged
      // on ITS OWN binding, so `inner.insert(…)` is fine even though `tx` is
      // lexically visible and unused.
      { code: tx(`await tx.transaction(async (inner) => { await inner.insert(t); });`) },
      // A callback with no plain-identifier param binds no executor — nothing to
      // verify, so we stay silent rather than report every await.
      { code: `await db.transaction(async () => { await db.select().from(t); });` },
      // A pool call OUTSIDE any transaction callback is this rule's non-business.
      { code: `await db.select().from(tasks);` },
    ],
    invalid: [
      // The real bug: queue/server/internal/repair-blocked-order.ts:42 — the
      // helper takes no executor, so it queues for a second pool connection
      // while the transaction pins the first.
      {
        code: tx(`await listBlockingDepIds(taskId);`),
        errors: [{ messageId: "poolAwait" }],
      },
      // Explicit pool read from inside the transaction.
      {
        code: tx(`await db.select().from(x);`),
        errors: [{ messageId: "poolAwait" }],
      },
      // Non-DB I/O inflates the connection lease just the same.
      {
        code: tx(`await fetch(url);`),
        errors: [{ messageId: "poolAwait" }],
      },
      // A nested transaction's own callback is checked against ITS binding: the
      // outer `tx` does not launder a pool read in the inner one.
      {
        code: tx(`await tx.transaction(async (inner) => { await db.select().from(t); });`),
        errors: [{ messageId: "poolAwait" }],
      },
      // A second connection is a second connection: awaiting a transaction on a
      // DIFFERENT executor from inside this one is the hold-and-wait shape.
      {
        code: tx(`await other.transaction(async (inner) => { await inner.insert(t); });`),
        errors: [{ messageId: "poolAwait" }],
      },
      // A query RESULT is data, not an executor — it must not launder the next
      // call the way a `{ tx }` carrier struct does.
      {
        code: tx(`const rows = await tx.select().from(t); await enrich(rows);`),
        errors: [{ messageId: "poolAwait" }],
      },
      // Both offenders are reported, and the legitimate one between them is not.
      {
        code: tx(`await fetch(url); await tx.insert(t); await readFile(p);`),
        errors: [{ messageId: "poolAwait" }, { messageId: "poolAwait" }],
      },
    ],
  },
);
