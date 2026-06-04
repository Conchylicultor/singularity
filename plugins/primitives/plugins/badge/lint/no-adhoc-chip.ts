import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Ad-hoc chip/badge markup — an intrinsic `<span>/<div>/<button>` styled with a
 * `rounded` corner plus small `px-`/`py-` padding — reintroduces exactly the
 * inconsistency the chip primitives (Badge, ToggleChip/SegmentedControl,
 * FilterChip, LinkChip) exist to close. This rule fingerprints that shape and
 * redirects to a sanctioned primitive. There is no auto-fix: choosing the right
 * primitive + variant, mapping a dynamic color class to `colorClass`, and adding
 * an import are all unsafe to mechanize.
 *
 * Unlike `no-arbitrary-font-size` (whose target is a single class token, so it
 * scans each `Literal`/`TemplateElement` independently), the chip fingerprint is
 * a *co-occurrence* of several classes that may live in different `cn()`
 * fragments. So we aggregate every class token of one `className` attribute into
 * a single Set, then test the fingerprint against that Set.
 */

// rounded corner: `rounded`, `rounded-md`, `rounded-full`, …
const ROUNDED = /^rounded(-|$)/;
// small horizontal pad — EXACT membership (must NOT match `px-2.5`).
const SMALL_PX = new Set(["px-0.5", "px-1", "px-1.5", "px-2"]);
// small vertical pad — EXACT membership.
const SMALL_PY = new Set(["py-px", "py-0.5", "py-1"]);
// interactive-row marker: any `hover:bg-*` (menus/list rows, not chips).
const HOVER_BG = /^hover:bg-/;
// named padding token (e.g. `p-chip`, `p-control`) — the sanctioned token
// escape. Defensive: such tokens preclude raw px/py anyway, but listing them
// documents the escape hatch. `p-[a-z]` avoids matching numeric `p-2`.
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

const HOST_TAGS = new Set(["span", "div", "button"]);

export default createRule({
  name: "no-adhoc-chip",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ad-hoc chip/badge markup (rounded + small px/py on a span/div/button) — use a sanctioned chip primitive.",
    },
    schema: [],
    messages: {
      adhocChip:
        "Ad-hoc chip/badge markup (rounded + small px/py on a span/div/button) is banned — " +
        "use a sanctioned primitive: Badge (static colored label/status, " +
        "@plugins/primitives/plugins/badge/web), ToggleChip/SegmentedControl (interactive on/off), " +
        "FilterChip (filter rows), or LinkChip (inline navigation). For a color from a dynamic " +
        "class map, pass colorClass to Badge. If this is intentionally not a chip (positioned " +
        "overlay, container), render it through a component or use a named padding token " +
        "(p-chip/p-control) instead of raw px-/py-.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        // Only `className` attributes.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Host-tag gate: a JSXAttribute's parent is always the JSXOpeningElement.
        // Require an intrinsic host tag in {span, div, button}. This skips
        // component elements (`<Badge>`, `<Foo>` — capitalized, render through a
        // primitive) and other intrinsics (`<code>`, `<a>`, `<input>`) for free.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier" || !HOST_TAGS.has(tag.name)) return;

        // Aggregate every class token of this attribute into one Set.
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);

        // Fingerprint: flag only when ALL THREE hold.
        let hasRounded = false;
        let hasSmallPx = false;
        let hasSmallPy = false;
        // Row/overlay exclusions: skip if ANY structural marker is present —
        // these separate chips from interactive rows / positioned overlays, the
        // buckets that have no primitive home yet.
        let excluded = false;
        for (const t of tokens) {
          if (ROUNDED.test(t)) hasRounded = true;
          if (SMALL_PX.has(t)) hasSmallPx = true;
          if (SMALL_PY.has(t)) hasSmallPy = true;
          if (
            t === "w-full" ||
            t === "text-left" ||
            t === "absolute" ||
            t === "fixed" ||
            t === "sticky" ||
            HOVER_BG.test(t) ||
            NAMED_PAD.test(t)
          ) {
            excluded = true;
          }
        }

        if (excluded) return;
        if (!hasRounded || !hasSmallPx || !hasSmallPy) return;

        // No auto-fix — report once on the whole attribute.
        context.report({ node, messageId: "adhocChip" });
      },
    };
  },
});
