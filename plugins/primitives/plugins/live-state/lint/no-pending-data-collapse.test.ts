/**
 * Tests for the `no-pending-data-collapse` lint rule. Run with `bun test` from
 * the repo root (or this file's directory).
 *
 * The rule bans `result.pending ? <emptyDefault> : result.data` on resource
 * results, but must NOT fire on the sanctioned `select`-based point reads
 * (`useResource(…, { select })`), on untainted objects that merely have a
 * `.pending` field, or on render ternaries whose pending branch is real UI.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-pending-data-collapse";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
});

// `RuleTester.run` drives the test harness itself (it calls the ambient
// describe/it that bun:test provides), so it must run at module top level —
// never wrapped in a `test()` callback.
ruleTester.run(
  "no-pending-data-collapse",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Sanctioned select-based point read — the carve-out.
      {
        code: `
          const q = useResource(conversationsResource, undefined, { select });
          const row = q.pending ? null : q.data;
        `,
      },
      // Untainted object with a pending field — not a resource result.
      {
        code: `
          const upload = { pending: true, data: [] };
          const x = upload.pending ? [] : upload.data;
        `,
      },
      // Pending branch is real UI, not an empty default.
      {
        code: `
          const r = useResource(songsResource);
          const node = r.pending ? renderSkeleton() : r.data.length;
        `,
      },
      // Early return — the sanctioned narrowing shape.
      {
        code: `
          function C() {
            const r = useResource(songsResource);
            if (r.pending) return null;
            return r.data.length;
          }
        `,
      },
      // Settled branch doesn't touch .data.
      {
        code: `
          const r = useResource(songsResource);
          const label = r.pending ? "" : "ready";
        `,
      },
    ],
    invalid: [
      // The canonical collapse.
      {
        code: `
          const r = useResource(songsResource);
          const rows = r.pending ? [] : r.data;
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
      // Negated test, branches swapped.
      {
        code: `
          const r = useResource(songsResource);
          const rows = !r.pending ? r.data : [];
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
      // Other empty defaults: null / false / 0 / {} and nested .data access.
      {
        code: `
          const r = useResource(pushesResource);
          const hasPush = r.pending ? false : r.data.some((p) => p.id === id);
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
      {
        code: `
          const r = useResource(tasksResource);
          const t = r.pending ? null : r.data.find((t) => t.id === id);
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
      // Cast empty default (`[] as Foo[]`).
      {
        code: `
          const r = useResource(tasksResource);
          const rows = r.pending ? ([] as Task[]) : r.data;
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
      // Hoisted empty-const default.
      {
        code: `
          const EMPTY = [];
          const r = useResource(tasksResource);
          const rows = r.pending ? EMPTY : r.data;
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
      // Optimistic results are tainted too.
      {
        code: `
          const r = useOptimisticResource({ resource, apply, mutate });
          const ranks = r.pending ? [] : r.data.ranks;
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
      // Combined results are tainted too.
      {
        code: `
          const all = useCombinedResources({ a, b });
          const rows = all.pending ? [] : all.data.a;
        `,
        errors: [{ messageId: "pendingCollapse" }],
      },
    ],
  },
);
