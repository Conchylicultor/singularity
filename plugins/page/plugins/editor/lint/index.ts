import noAdhocBlockId from "./no-adhoc-block-id";
import noAdhocForestWrite from "./no-adhoc-forest-write";
import noAdhocStructuralWrite from "./no-adhoc-structural-write";
import noModelFocusRing from "./no-model-focus-ring";

/**
 * Lint barrel for the page-editor rules. The root `eslint.config.ts`
 * auto-discovers this default export and registers each rule repo-wide as
 * `error`.
 *
 * ## `no-model-focus-ring`
 *
 * The one rule here that is about what the user SEES rather than about who may
 * write. It bans a focus/ring/outline class sitting in a class expression gated
 * on `isFocused` — because `isFocused` is the editor's own idea of where the
 * caret is, not the browser's `:focus-visible`, and an indicator painted from it
 * stops agreeing with real DOM focus. The divider proved it: the browser's
 * outline switched off unconditionally, a ring redrawn only under the model gate,
 * and a box that genuinely had focus while the two disagreed drew nothing.
 *
 * It carries **no `ignores` entry**, deliberately — unlike `row`'s rules, there
 * is no definition site to exempt. `VoidCaretBox`, the sanctioned home for the
 * caret cue, writes the focus utility UNCONDITIONALLY (that is the whole point:
 * the browser decides when it draws) and puts only a tint under the `isFocused`
 * gate, so it does not trip. If the definition site ever DID trip this rule, that
 * would be the signal that it had gone back to painting focus from the model —
 * not something to exempt.
 *
 * The remaining three are write-authority rules, each with exactly the modules
 * that hold the authority listed below.
 */
export default {
  name: "page-editor",
  rules: {
    "no-adhoc-block-id": noAdhocBlockId,
    "no-adhoc-forest-write": noAdhocForestWrite,
    "no-adhoc-structural-write": noAdhocStructuralWrite,
  },
  // Class rules are FACTORIES: they read class tokens, so they take the one
  // shared walk from `buildLintConfig` instead of hand-copying it. See
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-model-focus-ring": noModelFocusRing,
  },
  ignores: {
    // The one module allowed to mint a block id. Everything else — client ops,
    // server handlers, the forest mint — calls its `newBlockId()`.
    "no-adhoc-block-id": ["plugins/page/plugins/editor/core/block-id.ts"],
    // The one module allowed to mutate `page_blocks`. Every export there takes a
    // `PageForestTx`, so the write is provably under its page's lock.
    "no-adhoc-forest-write": [
      "plugins/page/plugins/editor/server/internal/forest-writer.ts",
    ],
    // The two modules allowed to call the structural endpoints: the page's own
    // optimistic instance, and the composite router that fans writes out to it
    // (and owns the two lane-enqueued writes that carry no overlay).
    "no-adhoc-structural-write": [
      "plugins/page/plugins/editor/web/block-store.ts",
      "plugins/page/plugins/editor/web/composite-block-store.tsx",
    ],
  },
};
