import noAdhocBlockId from "./no-adhoc-block-id";
import noAdhocDocWrite from "./no-adhoc-doc-write";
import noAdhocForestWrite from "./no-adhoc-forest-write";
import noAdhocStructuralWrite from "./no-adhoc-structural-write";
import noUnfilteredBlocksRead from "./no-unfiltered-blocks-read";
import noUnhistoriedBlockField from "./no-unhistoried-block-field";
import noModelFocusRing from "./no-model-focus-ring";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

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
 * It carries **no exemption**, deliberately — unlike `row`'s rules, there
 * is no definition site to exempt. `VoidCaretBox`, the sanctioned home for the
 * caret cue, writes the focus utility UNCONDITIONALLY (that is the whole point:
 * the browser decides when it draws) and puts only a tint under the `isFocused`
 * gate, so it does not trip. If the definition site ever DID trip this rule, that
 * would be the signal that it had gone back to painting focus from the model —
 * not something to exempt.
 *
 * ## `no-unhistoried-block-field`
 *
 * The other rule about what the user experiences rather than about who may
 * write. The block list declares `data-undo-owner="surface"`, so a raw
 * `<textarea>`/`<input>`/`contenteditable` anywhere beneath it that declares
 * nothing hands ⌘Z to the document stack — killing the browser's own history
 * for that field and reversing an unrelated block edit mid-typing. The rule
 * forces one of the two honest answers: `<BlockTextArea>` for text the page
 * persists, `localUndoProps` for transient chrome.
 *
 * ## `no-unfiltered-blocks-read`
 *
 * A READ-authority rule. Every block delete is a trash — the `page_blocks` row
 * stays, flagged `deleted_at` — so a plain `.from(_blocks)` reads deleted
 * content back into whatever surface asked. Readers take `liveBlocks` (the
 * table with the predicate baked in); only the trash machinery, listed below,
 * may read the raw table. Raw `sql\`… page_blocks …\`` reads are invisible to
 * an AST rule and are held to the same list by convention (three modules, each
 * saying whether it filters and why).
 *
 * ## `no-adhoc-doc-write`
 *
 * The content-doc twin of `no-adhoc-forest-write`. A block's canonical `Y.Doc`
 * takes writes from exactly three origins — the transport provider, the undo
 * replay, the relayed binding — and the run tracker classifies every
 * transaction over those three. A fourth writer calling `applyUpdate` onto an
 * owner's doc is read as the user typing, flushed, rendered, and undoable by
 * nothing. Only the modules that ARE those origins, listed below, may apply.
 *
 * The remaining three are write-authority rules, each with exactly the modules
 * that hold the authority listed below.
 */
export default {
  name: "page-editor",
  rules: {
    "no-adhoc-block-id": noAdhocBlockId,
    "no-adhoc-doc-write": noAdhocDocWrite,
    "no-adhoc-forest-write": noAdhocForestWrite,
    "no-adhoc-structural-write": noAdhocStructuralWrite,
    "no-unfiltered-blocks-read": noUnfilteredBlocksRead,
    "no-unhistoried-block-field": noUnhistoriedBlockField,
  },
  // Class rules are FACTORIES: they read class tokens, so they take the one
  // shared walk from `buildLintConfig` instead of hand-copying it. See
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-model-focus-ring": noModelFocusRing,
  },
} satisfies LintContribution;
