import { ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Steer a standalone icon action toward the curated `IconButton` primitive.
 *
 * `IconButton` (`@plugins/primitives/plugins/icon-button/web`) is the sanctioned
 * way to render a single icon action: it injects the mandatory `aria-label` +
 * tooltip and renders a bare `<Icon/>`, so the control is always accessible. A
 * hand-rolled `<Button aspect="icon"><MdX/></Button>` slips past that — the audit
 * found exactly this (an icon action with no `aria-label`).
 *
 * `aspect="icon"` on `Button` stays the legitimate base square-geometry
 * primitive (trigger render-targets, text-glyph buttons, stateful-indicator
 * children), so this rule fires NARROWLY — only on the unmistakable
 * "single react-icons glyph as a direct, standalone child" shape:
 *
 *   1. the element has `aspect="icon"` (string literal), AND
 *   2. its children — ignoring whitespace `JSXText` — are EXACTLY ONE
 *      `JSXElement`, AND
 *   3. that child's tag identifier resolves (via scope → import binding) to a
 *      module matching `^react-icons(/|$)` — the `IconButton.icon` contract, AND
 *   4. the `<Button>` is NOT a render-target prop value (`trigger={<Button…/>}`
 *      / `render={<Button…/>}`), which legitimately keeps a bare Button.
 *
 * This is pure JSX-structure inspection (scope walk for the import binding) — no
 * `@plugins`/shared imports — so it loads cleanly under jiti, which cannot
 * resolve the `@plugins/*` alias. No auto-fix (the label text can't be inferred).
 */

const REACT_ICONS_MODULE = /^react-icons(\/|$)/;

/**
 * Resolve a JSX child-element's tag identifier to the module it was imported
 * from, returning that module specifier (or null if it isn't an import binding).
 * Same-file scope walk only — a local component or a member-expression tag
 * (`<foo.Bar/>`) is not a react-icons import and yields null.
 */
function importSourceOfTag(
  sourceCode: TSESLint.SourceCode,
  name: TSESTree.JSXTagNameExpression,
): string | null {
  if (name.type !== "JSXIdentifier") return null;
  let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(name as unknown as TSESTree.Node);
  let variable: TSESLint.Scope.Variable | undefined;
  while (scope && !variable) {
    variable = scope.variables.find((v) => v.name === name.name);
    scope = scope.upper;
  }
  if (!variable) return null;
  for (const def of variable.defs) {
    if (
      def.type === "ImportBinding" &&
      def.parent.type === "ImportDeclaration" &&
      typeof def.parent.source.value === "string"
    ) {
      return def.parent.source.value;
    }
  }
  return null;
}

export default createRule({
  name: "prefer-icon-button",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Steer a standalone `<Button aspect=\"icon\">` whose only child is a react-icons glyph toward `<IconButton icon={…} label=… />`, which adds the mandatory aria-label + tooltip.",
    },
    schema: [],
    messages: {
      preferIconButton:
        "A standalone icon action should use `<IconButton icon={…} label=… />` (it adds the mandatory aria-label + tooltip). Keep a bare `<Button aspect=\"icon\">` only for triggers / text-glyph / stateful children.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXElement(node) {
        const opening = node.openingElement;
        const tag = opening.name;
        if (tag.type !== "JSXIdentifier" || tag.name !== "Button") return;

        // (1) `aspect="icon"` as a string literal.
        const hasIconAspect = opening.attributes.some(
          (attr) =>
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "aspect" &&
            attr.value?.type === "Literal" &&
            attr.value.value === "icon",
        );
        if (!hasIconAspect) return;

        // (4) skip render-target prop values: `trigger={<Button…/>}` etc.
        if (
          node.parent.type === "JSXExpressionContainer" &&
          node.parent.parent.type === "JSXAttribute"
        ) {
          return;
        }

        // (2) children, ignoring whitespace JSXText, are exactly one JSXElement.
        const meaningful = node.children.filter(
          (c) => !(c.type === "JSXText" && c.value.trim() === ""),
        );
        if (meaningful.length !== 1) return;
        const only = meaningful[0]!;
        if (only.type !== "JSXElement") return;

        // (3) that child's tag resolves to a react-icons import.
        const source = importSourceOfTag(context.sourceCode, only.openingElement.name);
        if (!source || !REACT_ICONS_MODULE.test(source)) return;

        context.report({ node, messageId: "preferIconButton" });
      },
    };
  },
});
