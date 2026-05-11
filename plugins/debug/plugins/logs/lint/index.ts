import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://internal/lint/debug-logs/${name}`,
);

const noConsoleLog = createRule({
  name: "no-console-log",
  meta: {
    type: "problem",
    docs: { description: "Disallow console.log; use Log.channel() instead." },
    schema: [],
    messages: {
      noConsole: "Use a structured logger instead of console.log.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      "CallExpression[callee.object.name='console'][callee.property.name='log']"(
        node,
      ) {
        context.report({ node, messageId: "noConsole" });
      },
    };
  },
});

export default {
  name: "debug-logs",
  rules: { "no-console-log": noConsoleLog },
};
