import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** `x.registerUpdateListener(...)` — the Lexical editor-update subscription. */
function isRegisterUpdateListener(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "registerUpdateListener"
  );
}

/** `text.lastIndexOf(...)` / `text.indexOf(...)` — the hand-rolled trigger scan. */
function isIndexScan(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    (callee.property.name === "lastIndexOf" || callee.property.name === "indexOf")
  );
}

/** The caret-trigger primitive's web barrel, at any nesting depth. */
const CARET_TRIGGER_BARREL = /text-editor\/plugins\/caret-trigger\/web$/;

/**
 * The two surface-building exports. Importing either says "I am rendering a
 * caret-anchored menu"; `useCaretMenu` is where that menu's keyboard model
 * comes from.
 */
const SURFACE_EXPORTS = new Set(["caretAnchor", "CaretTriggerMenu"]);

/** `useCaretMenu(...)` — the hook that owns arrows / Enter / Esc / commit. */
function isUseCaretMenu(node: TSESTree.CallExpression): boolean {
  return node.callee.type === "Identifier" && node.callee.name === "useCaretMenu";
}

export default createRule({
  name: "no-adhoc-caret-trigger",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hand-rolling a caret-trigger menu — deriving a menu's open-state " +
        "by scanning editor text from inside a Lexical `registerUpdateListener`, or " +
        "building a caret-anchored surface without `useCaretMenu`'s keyboard model.",
    },
    schema: [],
    messages: {
      adhocCaretTrigger:
        "This file scans editor text for a trigger from inside a Lexical " +
        "`registerUpdateListener` — the hand-rolled caret-menu shape. Four copies of " +
        "it each carried a `dismissedRef` latch that no branch was guaranteed to " +
        "reset, so an empty block wedged the menu closed permanently. Use " +
        "`useCaretQuery` + `useCaretMenu` from " +
        "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web, which " +
        "derives open-state instead of latching it. If your trigger needs something " +
        "the hook can't express, extend the primitive rather than copying it.",
      caretSurfaceWithoutMenu:
        "`{{name}}` builds a caret-anchored menu surface, but this file never calls " +
        "`useCaretMenu` — so the menu has no keyboard model: arrows don't move the " +
        "selection, Enter doesn't commit, and Esc / outside-press aren't wired. That " +
        "is a mouse-only menu (the `url-paste` bug). Take the whole primitive: pair a " +
        "`useCaretQuery` (trigger char) or `useForcedCaretQuery` (external open " +
        "signal, e.g. a paste or a button) with `useCaretMenu`, and commit rows " +
        "through its `commit(index)`.",
    },
  },
  defaultOptions: [],
  create(context) {
    // Both halves must appear in the same file: a `registerUpdateListener` alone
    // is a legitimate subscription (markdown shortcuts, format toolbar, the
    // doc→row projection), and an `indexOf` alone is just string work. Their
    // conjunction is the scan-open-state-from-editor-updates shape.
    const listeners: TSESTree.CallExpression[] = [];
    let sawIndexScan = false;

    // The half-adoption shape: a file that reaches into the primitive for the
    // SURFACE (its caret anchor / menu component) but not for the KEYBOARD.
    // Rendering is the visible half, so it is the half that gets copied; the
    // keyboard model is invisible until someone presses a key. The primitive's
    // own files import via relative paths, so they never match the barrel.
    const surfaceImports: { node: TSESTree.Node; name: string }[] = [];
    let sawUseCaretMenu = false;

    return {
      ImportDeclaration(node) {
        if (!CARET_TRIGGER_BARREL.test(node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier" || spec.imported.type !== "Identifier") continue;
          if (SURFACE_EXPORTS.has(spec.imported.name)) {
            surfaceImports.push({ node: spec, name: spec.imported.name });
          }
        }
      },
      CallExpression(node) {
        if (isRegisterUpdateListener(node)) listeners.push(node);
        else if (isIndexScan(node)) sawIndexScan = true;
        if (isUseCaretMenu(node)) sawUseCaretMenu = true;
      },
      "Program:exit"() {
        if (sawIndexScan) {
          for (const node of listeners) {
            context.report({ node, messageId: "adhocCaretTrigger" });
          }
        }
        if (!sawUseCaretMenu) {
          for (const { node, name } of surfaceImports) {
            context.report({ node, messageId: "caretSurfaceWithoutMenu", data: { name } });
          }
        }
      },
    };
  },
});
