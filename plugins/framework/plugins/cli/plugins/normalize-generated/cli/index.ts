import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * The command end of the generated-artifact merge contract. Its normal invoker
 * is not a human but the `post-rewrite` git hook, which fires after every rebase
 * or amend — so it is written to be cheap and marker-gated, not to be typed.
 */
export default defineCliCommand({
  name: "normalize-generated",
  description:
    "Repair generated artifacts a merge driver auto-resolved during a merge or " +
    "rebase: re-derive them from the merged sources and amend the head commit. " +
    "Marker-gated, so it is a no-op after a merge that touched no generated " +
    "file. Invoked automatically by the `post-rewrite` git hook after any " +
    "rebase/amend, and by `push` around its own rebase — run it by hand only " +
    "when a check reports an un-normalized auto-resolve. Idempotent.",
  run: () => import("./run"),
});
