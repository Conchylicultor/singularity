import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Z-layer standardization guardrail.
 *
 * Stacking order must come from ONE ordered, named ladder: the semantic
 * `--z-*` scale defined in `plugins/primitives/plugins/ui-kit/web/theme/app.css`
 * and exposed as the `z-base / z-raised / z-nav / z-float / z-overlay / z-popover
 * / z-draw / z-max` `@utility` classes. A raw `z-<n>` / `z-[…]` value is opaque
 * intent — it can't say *which* layer it means — and scattering raw numbers
 * across call sites is how stacking bugs (a floating panel painting under a
 * sibling) creep back in.
 *
 * This rule fingerprints the escape hatch: any `className` token that is a raw
 * Tailwind z-index utility — built-in numerics (`z-0`…`z-50`) or arbitrary
 * values (`z-[60]`, `z-[9999]`). The named `z-<word>` utilities are NOT raw and
 * are intentionally allowed.
 *
 * No auto-fix: picking the right layer is a per-site judgement (same stance as
 * `no-adhoc-control`).
 */

// Raw z-index: a built-in numeric (`z-0`…`z-50`) or an arbitrary value
// (`z-[60]`, `z-[9999]`). The named utilities (`z-base`, `z-raised`, …) start
// with a letter after `z-`, so they never match.
const RAW_ZINDEX = /^z-(\d|\[)/;

/**
 * Recursively collect class tokens from a `className` attribute value subtree.
 * We harvest only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions (e.g. a `STATE_STYLES[x]` member
 * access), so map-driven color classes are correctly ignored as opaque. Each
 * harvested string is split on whitespace into the shared token Set.
 *
 * Handles the shapes a `className` realistically takes: a bare string literal, a
 * `JSXExpressionContainer` wrapping a template literal, a `cn(...)`/`clsx(...)`
 * call, ternaries/logical expressions, and arbitrary nesting thereof. The walk
 * is structural (visit every child node) rather than shape-specific, so it is
 * robust to however the class string is assembled.
 */
function collectTokens(node: TSESTree.Node | null | undefined, out: Set<string>): void {
  if (!node) return;
  if (node.type === "Literal") {
    if (typeof node.value === "string") {
      for (const t of node.value.split(/\s+/)) if (t) out.add(t);
    }
    return;
  }
  if (node.type === "TemplateElement") {
    for (const t of node.value.raw.split(/\s+/)) if (t) out.add(t);
    return;
  }
  // Generic structural recursion: walk every child node/array of nodes. This
  // covers JSXExpressionContainer, TemplateLiteral, CallExpression (cn/clsx),
  // ConditionalExpression, LogicalExpression, ArrayExpression, etc. without
  // enumerating each shape.
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          collectTokens(child as TSESTree.Node, out);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      collectTokens(value as TSESTree.Node, out);
    }
  }
}

/**
 * Strip Tailwind variant prefixes (`hover:`, `focus:`, `md:`, `dark:`, …) so the
 * geometric class underneath is tested on its own. Variants are colon-delimited
 * and the utility itself is the LAST `:`-segment (e.g. `hover:rounded-full` ->
 * `rounded-full`, `md:px-2` -> `px-2`). This mirrors how `badge/no-adhoc-chip`
 * reasons about prefixed tokens.
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

export default createRule({
  name: "no-adhoc-zindex",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw z-index utilities (z-0…z-50, z-[…]). Stacking order must come from the semantic z-layer scale (z-raised, z-nav, z-float, z-overlay, z-popover, z-draw, z-max).",
    },
    schema: [],
    messages: {
      adhocZindex:
        "Use a semantic z-layer utility (z-raised, z-nav, z-float, z-overlay, z-popover, z-draw, z-max) from the z-layers scale instead of a raw z-index. See plugins/primitives/plugins/ui-kit/web/theme/app.css.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // z-index is not element-specific — flag a raw z token on ANY element.
      JSXAttribute(node) {
        // Only `className` attributes.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Aggregate every class token of this attribute into one Set, stripping
        // variant prefixes so `hover:z-10` etc. count as their base.
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);

        const hasRawZindex = [...tokens].some((t) => RAW_ZINDEX.test(baseClass(t)));
        if (!hasRawZindex) return;

        context.report({ node, messageId: "adhocZindex" });
      },
    };
  },
});
