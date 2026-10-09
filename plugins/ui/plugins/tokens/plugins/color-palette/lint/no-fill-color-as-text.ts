import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import type { LintToolkit } from "@plugins/framework/plugins/tooling/plugins/lint/core";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * `primary`, `destructive` and `success` are FILL colours (Send, Stop, Go,
 * a destructive button), read with their `*-foreground` label on top. Used as text on a
 * surface they need the palette's text twins (`primary-text`,
 * `destructive-text`, `success-text`): on a dark surface no single value is both dark enough
 * for a white label at 4.5:1 and light enough to read at 4.5:1 against the
 * surface, so a theme with deep fills sets the twins lighter. A bare
 * `text-primary` / `text-destructive` / `text-success` would paint the fill colour as text and
 * go unreadable under such a theme.
 *
 * Flags the bare text-colour utility (any variant prefix, any opacity
 * modifier); `text-primary-foreground` and the `-text` twins are untouched.
 */
const FILL_AS_TEXT = /^text-(primary|destructive|success)(\/\d+)?$/;

export default function buildRule({
  collectTokens,
  baseClass,
  CLASS_ATTRS,
  CLASS_BUILDERS,
}: LintToolkit) {
  return createRule({
    name: "no-fill-color-as-text",
    meta: {
      type: "problem",
      docs: {
        description:
          "Disallow text-primary / text-destructive / text-success: text takes the palette's text twins (text-*-text), the fill colours stay fills.",
      },
      schema: [],
      messages: {
        fillAsText:
          "`{{token}}` paints a fill colour as text. Use `text-{{role}}-text` (the palette's {{role}}Text token), which a theme can lift for readability on its surface while `{{role}}` stays the button fill.",
      },
    },
    defaultOptions: [],
    create(context) {
      function checkTokens(node: TSESTree.Node, tokens: Set<string>) {
        for (const token of tokens) {
          const c = baseClass(token);
          const m = FILL_AS_TEXT.exec(c);
          if (m) {
            context.report({
              node,
              messageId: "fillAsText",
              data: { token: c, role: m[1] },
            });
          }
        }
      }
      return {
        JSXAttribute(node) {
          if (
            node.name.type !== "JSXIdentifier" ||
            !CLASS_ATTRS.test(node.name.name)
          )
            return;
          const tokens = new Set<string>();
          collectTokens(context.sourceCode, node.value, tokens);
          checkTokens(node, tokens);
        },
        CallExpression(node) {
          if (
            node.callee.type !== "Identifier" ||
            !CLASS_BUILDERS.has(node.callee.name)
          )
            return;
          const tokens = new Set<string>();
          for (const arg of node.arguments)
            collectTokens(context.sourceCode, arg, tokens);
          checkTokens(node, tokens);
        },
      };
    },
  });
}
