import { ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

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

// >>> shared:class-token-walk — keep byte-identical across the no-adhoc-* class rules (enforced by the class-token-walk-in-sync check) >>>
/**
 * Recursively harvest class-name tokens from a class-value subtree into `out`.
 *
 * Directly contained strings are harvested wherever they sit: bare `Literal`
 * `.value`s and `TemplateElement.value.raw`s (split on whitespace), inside
 * `cn(...)`/`clsx(...)` calls, ternaries, `clsx({ "text-x": cond })` object
 * keys, and arbitrary nesting — the walk is structural, not shape-specific.
 *
 * It ALSO follows same-file aliases, but ONLY when an `Identifier` reached from
 * a class context resolves to an object/array-literal MAP indexed directly in
 * that context (e.g. `cn(TONE[tone])`, `styles.title`). The map's initializer is
 * then harvested too — this is what catches a banned class parked in a style/tone
 * map. A standalone string/template `const` (shared mono/code metrics are out of
 * scope) and a styling-function result (`cva(...)`) are deliberately NOT followed,
 * and a map reached only through an intermediate local is out of range by design.
 * Resolution is same-file only (an imported or parameter binding has no in-file
 * initializer to read) and cycle-guarded via `seen`. Because the walk only ever
 * starts from a real class-name context, an unrelated doc-string that merely
 * mentions `text-sm` is never inspected.
 */
function collectTokens(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | null | undefined,
  out: Set<string>,
  seen: Set<unknown> = new Set(),
): void {
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
  if (node.type === "Identifier") {
    let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(node);
    let variable: TSESLint.Scope.Variable | undefined;
    while (scope && !variable) {
      variable = scope.variables.find((v) => v.name === node.name);
      scope = scope.upper;
    }
    if (variable && !seen.has(variable)) {
      seen.add(variable);
      for (const def of variable.defs) {
        // Maps-only: follow a same-file alias ONLY into an object/array-literal
        // map — the documented "style map drives classes" pattern, indexed
        // directly in a class context (e.g. `cn(TONE[tone])`). A standalone
        // string/template const (shared mono-code metrics — code/mono is out of
        // scope) or a styling-function result (`cva(...)`) is deliberately NOT
        // followed, and a map reached only through an intermediate local is out
        // of range by design.
        const init = def.type === "Variable" ? def.node.init : null;
        if (init && (init.type === "ObjectExpression" || init.type === "ArrayExpression")) {
          collectTokens(sourceCode, init, out, seen);
        }
      }
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          collectTokens(sourceCode, child as TSESTree.Node, out, seen);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      collectTokens(sourceCode, value as TSESTree.Node, out, seen);
    }
  }
}
// <<< shared:class-token-walk <<<

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
        collectTokens(context.sourceCode, node.value, tokens);

        const hasRawZindex = [...tokens].some((t) => RAW_ZINDEX.test(baseClass(t)));
        if (!hasRawZindex) return;

        context.report({ node, messageId: "adhocZindex" });
      },
    };
  },
});
