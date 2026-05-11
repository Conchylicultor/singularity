import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

export default createRule({
  name: "no-bare-catch",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow .catch() handlers that silently swallow rejections.",
    },
    schema: [],
    messages: {
      empty:
        "Empty .catch() silently swallows errors — this hides bugs. " +
        "Handle the specific exception and re-throw unknown errors, " +
        "or remove the .catch() and use `void promise` if fire-and-forget is intentional " +
        "(errors still surface via the global unhandledrejection handler). " +
        "See CLAUDE.md § Promise handling.",
      consoleOnly:
        ".catch(console.error/warn) logs the error but swallows the rejection — " +
        "the caller sees success and the bug becomes invisible. " +
        "Throw after logging, or propagate the rejection. " +
        "See CLAUDE.md § Promise handling.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      "CallExpression[callee.property.name='catch']"(
        node: TSESTree.CallExpression,
      ) {
        const arg = node.arguments[0];
        if (!arg) return;

        if (
          (arg.type === "ArrowFunctionExpression" ||
            arg.type === "FunctionExpression") &&
          arg.body.type === "BlockStatement" &&
          arg.body.body.length === 0
        ) {
          context.report({ node, messageId: "empty" });
          return;
        }

        if (
          arg.type === "MemberExpression" &&
          arg.object.type === "Identifier" &&
          arg.object.name === "console" &&
          arg.property.type === "Identifier" &&
          (arg.property.name === "error" || arg.property.name === "warn")
        ) {
          context.report({ node, messageId: "consoleOnly" });
        }
      },
    };
  },
});
