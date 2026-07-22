import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

export default createRule({
  name: "no-adhoc-scroll-into-view",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hand-rolling `element.scrollIntoView(...)` — route " +
        '"reveal an element on activation" through the scroll-reveal primitive.',
    },
    schema: [],
    messages: {
      adhocScrollIntoView:
        "`{{api}}` is banned outside the scroll-reveal primitive. Use " +
        "`useRevealOnActive` / `revealElement` from " +
        "`@plugins/primitives/plugins/scroll-reveal/web` instead (reveals fire " +
        "on activation transitions or explicit intent, never on remount). If " +
        "you have a genuinely different need, extend that primitive rather than " +
        "copying it.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          (callee.property.name === "scrollIntoView" ||
            callee.property.name === "scrollIntoViewIfNeeded")
        ) {
          context.report({
            node,
            messageId: "adhocScrollIntoView",
            data: { api: callee.property.name },
          });
        }
      },
    };
  },
});
