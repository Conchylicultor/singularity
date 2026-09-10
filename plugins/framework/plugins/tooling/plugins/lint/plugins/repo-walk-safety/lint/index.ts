import noAdhocRepoWalk from "./no-adhoc-repo-walk";

export default {
  name: "repo-walk-safety",
  rules: {
    "no-adhoc-repo-walk": noAdhocRepoWalk,
  },
  ignores: {
    "no-adhoc-repo-walk": [
      // ── Bounded walks of a KNOWN subtree, not attempts to enumerate the
      // repo's sources. These skip `node_modules` because walking into it would
      // be slow and pointless, not because they are deciding what counts as a
      // source file — so git's answer is not what they want.
      //
      // `ensure-deps` walks for dependency INPUTS (package.json / lockfiles),
      // and `node_modules` is the output it is deciding whether to rebuild.
      "plugins/framework/plugins/cli/plugins/bootstrap/cli/ensure-deps.ts",
      // `global-css` collects each plugin's own stylesheet from the plugin tree.
      "plugins/framework/plugins/tooling/plugins/web-artifacts/core/internal/global-css.ts",

      // ── A known instance of the very bug this rule exists to stop, left in
      // place deliberately rather than swept under an unexplained exemption.
      // The older standalone boundary checker; converting it is its own change
      // with its own review. (Its sibling `plugin-boundaries` was converted in
      // cbf79336e.) Tracked as a separate task.
      "plugins/framework/plugins/tooling/plugins/boundaries/core/check.ts",
      // A one-off migration script that already ran; it walks the same way its
      // contemporaries did.
      "plugins/framework/plugins/tooling/plugins/checks/core/scripts/fix-shared-to-relative.ts",
    ],
  },
};
