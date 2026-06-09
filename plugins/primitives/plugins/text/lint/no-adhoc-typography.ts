import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Typographic-hierarchy guardrail.
 *
 * Text hierarchy must come from ONE closed set of semantic roles — the `<Text
 * role>` primitive (`@plugins/primitives/plugins/text/web`), whose roles map to
 * the `text-<role>` `@utility` bundles backed by the typography token group.
 * Hand-writing a raw named font size (`text-sm`, `text-xl`, …) or a raw
 * `leading-*` line-height reintroduces the per-call type sprawl the role set
 * exists to close, and only repaints color on flat bones when a theme swaps.
 *
 * This rule fires on ANY element (not just a host-tag subset): typography is set
 * everywhere, so the redirect to `<Text>` applies everywhere.
 *
 * Two banned shapes, after stripping variant prefixes:
 *
 *   A. `SIZE` — a NAMED font-size step `text-{xs,sm,base,lg,xl,2xl…9xl}`. This is
 *      deliberately narrow: it must NOT match color classes (`text-muted-
 *      foreground`, `text-primary`) nor the sanctioned sub-scale `text-2xs` /
 *      `text-3xs` (chips/badges, below role granularity). The `\d` boundary on
 *      `[2-9]xl` and the lack of a `2xs`/`3xs` alternative guarantee both.
 *
 *   B. `LEADING` — any raw `leading-*` line-height (role bundles own the
 *      line-height; a standalone `leading-*` overrides it ad-hoc).
 *
 * No auto-fix: choosing the right role + tone + `as` is a semantic decision,
 * unsafe to mechanize.
 *
 * Class strings appear in two shapes — bare JSX `className="…"` and inside
 * `cn(...)`/`clsx(...)`/template literals. We only inspect strings in a
 * class-name context (a `className`/`class` attribute value, or a class-builder
 * argument), via the same `collectClassNodes` walk the sibling `no-adhoc-*`
 * rules use, so a doc-string or fixture that merely mentions `text-sm` is never
 * flagged.
 */

// Named font-size step only: text-xs/sm/base/lg/xl and text-2xl…text-9xl.
// The `2xs`/`3xs` sub-scale and color classes (text-muted-foreground, …) are
// intentionally OUT — the alternation lists only size steps and anchors with $.
const SIZE = /^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/;
// Any raw line-height utility.
const LEADING = /^leading-/;

/** JSX attribute names whose value is a class-name string. */
const CLASS_ATTRS = new Set(["className", "class"]);
/** Class-builder calls whose string arguments are class-name strings. */
const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

/**
 * Recursively collect class tokens from a class-name value subtree into `out`.
 * We harvest only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions — and split each on whitespace.
 *
 * Handles the shapes a class-name realistically takes: a bare string literal, a
 * `JSXExpressionContainer` wrapping a template literal, a `cn(...)`/`clsx(...)`
 * call, ternaries/logical expressions, and arbitrary nesting thereof. The walk
 * is structural (visit every child node) rather than shape-specific, so it is
 * robust to however the class string is assembled — and, because it starts only
 * from class-name contexts, it never inspects unrelated string literals.
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
 * utility underneath is tested on its own. Variants are colon-delimited and the
 * utility itself is the LAST `:`-segment (e.g. `md:text-lg` -> `text-lg`). This
 * mirrors how the sibling `no-adhoc-*` rules reason about prefixed tokens.
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

export default createRule({
  name: "no-adhoc-typography",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw named font sizes (text-xs/sm/base/lg/xl/…) and leading-* — set text hierarchy through the <Text variant> primitive.",
    },
    schema: [],
    messages: {
      adhocTypography:
        "Raw typography class `{{token}}` is banned — set text hierarchy through " +
        "the <Text variant> primitive from @plugins/primitives/plugins/text/web " +
        "(variants: title | heading | subheading | body | label | caption). The " +
        "sub-scale text-2xs / text-3xs stays for chips/badges.",
    },
  },
  defaultOptions: [],
  create(context) {
    /** Report every banned class token in the harvested set. */
    function checkTokens(node: TSESTree.Node, tokens: Set<string>) {
      for (const token of tokens) {
        const c = baseClass(token);
        if (SIZE.test(c) || LEADING.test(c)) {
          context.report({ node, messageId: "adhocTypography", data: { token: c } });
        }
      }
    }

    return {
      // className / class attribute values — `className="…"`,
      // `className={`…`}`, `className={cn(…)}`, etc., on ANY element.
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !CLASS_ATTRS.has(node.name.name)) return;
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);
        checkTokens(node, tokens);
      },
      // Class-builder calls — `cn(...)`, `clsx(...)`, … — wherever they appear
      // (a `const cls = cn("text-sm")` assigned outside JSX still counts).
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !CLASS_BUILDERS.has(node.callee.name)) {
          return;
        }
        const tokens = new Set<string>();
        for (const arg of node.arguments) collectTokens(arg, tokens);
        checkTokens(node, tokens);
      },
    };
  },
});
