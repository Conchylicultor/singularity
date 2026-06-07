import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Ad-hoc interactive-row markup — an intrinsic `<span>/<div>/<button>/<a>` styled
 * with a `rounded` corner plus small `px-`/`py-` padding AND an interactive signal
 * (`w-full` / `text-left` / `hover:bg-`) — reinvents the row/menu/section-header
 * shape the Row primitives (Row, SectionHeaderRow) exist to close, or the ghost
 * button / tab shape Button/IconButton/SegmentedControl already own. This rule
 * fingerprints that shape and redirects to a sanctioned primitive. There is no
 * auto-fix: choosing Row vs Button vs SegmentedControl, mapping props, and adding
 * an import are all unsafe to mechanize.
 *
 * This is the exact *complement* of `badge/no-adhoc-chip`: the chip rule fires on
 * the same rounded+small-padding shape but EXCLUDES the interactive signals; this
 * rule claims exactly that excluded set. The predicates are complementary so no
 * element ever trips both rules.
 *
 * Like the chip rule, the row fingerprint is a *co-occurrence* of several classes
 * that may live in different `cn()` fragments. So we aggregate every class token
 * of one `className` attribute into a single Set, then test the fingerprint
 * against that Set.
 */

// rounded corner: `rounded`, `rounded-md`, `rounded-full`, …
const ROUNDED = /^rounded(-|$)/;
// small horizontal pad — EXACT membership (wider than the chip rule: px→3 to
// catch tabs `px-3 py-1.5` and ghost buttons). Must NOT match `px-4`.
const SMALL_PX = new Set(["px-0.5", "px-1", "px-1.5", "px-2", "px-2.5", "px-3"]);
// small vertical pad — EXACT membership (wider than the chip rule: py→2).
const SMALL_PY = new Set(["py-px", "py-0.5", "py-1", "py-1.5", "py-2"]);
// interactive-row marker: any `hover:bg-*` (menus/list rows, not chips).
const HOVER_BG = /^hover:bg-/;
// named padding token (e.g. `p-row`, `p-control`, `p-chip`) — the sanctioned
// token escape. Defensive: such tokens preclude raw px/py anyway, but listing
// them documents the escape hatch. `p-[a-z]` avoids matching numeric `p-2`.
const NAMED_PAD = /^p-[a-z]/;

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

const HOST_TAGS = new Set(["span", "div", "button", "a"]);

export default createRule({
  name: "no-adhoc-row",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ad-hoc interactive-row markup (rounded + small px/py + w-full/text-left/hover:bg- on a span/div/button/a) — use a sanctioned primitive (Row/SectionHeaderRow, Button/IconButton, SegmentedControl).",
    },
    schema: [],
    messages: {
      adhocRow:
        "Ad-hoc interactive control (rounded + small px/py + `w-full`/`text-left`/`hover:bg-` on a " +
        "span/div/button/a) — route through a primitive: `Row`/`SectionHeaderRow` (list, menu, nav, " +
        "tree, and collapsible section-header rows), `Button`/`IconButton` (single actions), or " +
        "`SegmentedControl` (tab / segment groups). If intentionally bespoke (positioned overlay, " +
        "a primitive's own internals), render through a component, use a named padding token " +
        "(`p-row`/`p-control`), or `// eslint-disable-next-line row/no-adhoc-row -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        // Only `className` attributes.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Host-tag gate: a JSXAttribute's parent is always the JSXOpeningElement.
        // Require an intrinsic host tag in {span, div, button, a}. This skips
        // component elements (`<Row>`, `<Foo>` — capitalized, render through a
        // primitive) and other intrinsics (`<code>`, `<input>`) for free.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier" || !HOST_TAGS.has(tag.name)) return;

        // Aggregate every class token of this attribute into one Set.
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);

        // Fingerprint: flag only when ALL of {rounded, small px, small py,
        // interactive signal} hold.
        let hasRounded = false;
        let hasSmallPx = false;
        let hasSmallPy = false;
        let hasSignal = false;
        // Exclusions: skip if ANY structural escape is present — positioned
        // overlays (cluster H) escape structurally, named-pad tokens are the
        // sanctioned primitive escape.
        let excluded = false;
        for (const t of tokens) {
          if (ROUNDED.test(t)) hasRounded = true;
          if (SMALL_PX.has(t)) hasSmallPx = true;
          if (SMALL_PY.has(t)) hasSmallPy = true;
          if (t === "w-full" || t === "text-left" || HOVER_BG.test(t)) {
            hasSignal = true;
          }
          if (
            t === "absolute" ||
            t === "fixed" ||
            t === "sticky" ||
            NAMED_PAD.test(t)
          ) {
            excluded = true;
          }
        }

        if (excluded) return;
        if (!hasRounded || !hasSmallPx || !hasSmallPy || !hasSignal) return;

        // No auto-fix — report once on the whole attribute.
        context.report({ node, messageId: "adhocRow" });
      },
    };
  },
});
