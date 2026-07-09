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

export default createRule({
  name: "no-adhoc-caret-trigger",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hand-rolling a caret-trigger menu — deriving a menu's open-state " +
        "by scanning editor text from inside a Lexical `registerUpdateListener`.",
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

    return {
      CallExpression(node) {
        if (isRegisterUpdateListener(node)) listeners.push(node);
        else if (isIndexScan(node)) sawIndexScan = true;
      },
      "Program:exit"() {
        if (!sawIndexScan) return;
        for (const node of listeners) {
          context.report({ node, messageId: "adhocCaretTrigger" });
        }
      },
    };
  },
});
