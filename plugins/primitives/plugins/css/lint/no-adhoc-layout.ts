import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Layout-composition guardrail — the last unguarded design dimension.
 *
 * Layout is the one axis with no semantic primitive and no enforcement, so the
 * overlap/clip bug class keeps reopening: every call site re-derives a global
 * space-sharing negotiation by hand with raw `flex … min-w-0 shrink-0 flex-1`
 * soup. The cure is the same one the sibling `no-adhoc-*` rules already prove:
 * redirect raw utilities to a closed set of semantic primitives.
 *
 * This rule bans the raw layout utilities — composition mechanics that belong
 * to a primitive, not to a per-element `className`:
 *
 *   - flow / display:  `flex`, `inline-flex`, `flex-1`, `flex-col`, `flex-wrap`,
 *                      `flex-none`, `basis-*`, `grid`, `inline-grid`,
 *                      `grid-cols-*`, `grid-flow-*`, `col-span-*`, `row-span-*`
 *   - space-sharing:   `shrink-*`, `grow-*`, `min-w-0` (the truncation-leaf footgun)
 *   - alignment:       `items-*`, `justify-*`, `place-*`, `self-*`
 *   - positioning:     `absolute`, `fixed`, `sticky`, `inset-*`
 *   - clipping:        `overflow-*`
 *
 * Compose these through the layout primitives instead:
 *   - `<Stack direction="row">` / `<Cluster>` / `<Row>` — horizontal rows.
 *   - `<Grid>` / `<Center>` / `<Overlay>` — the other layout modes.
 *   - `<Stack>` / `<Inset>` (@plugins/primitives/plugins/css/plugins/spacing/web) — 1-D flow.
 *   - `<Text>` inside a line container — THE truncation leaf; the only home for
 *     `min-w-0` (it ellipsizes via the ambient single-line context).
 *
 * NOT banned (deliberately): `relative` / `static` (positioning *context* is
 * benign — Overlay establishes it), sizing (`w-*`, `h-*`, `size-*`, `min-w-*`
 * other than `min-w-0`), display values that aren't flow containers (`block`,
 * `hidden`, `inline`). Spacing (`gap-*`/`p-*`/`m-*`) and `z-*` have their own
 * rules — this one stays out of their lane to avoid double-reporting.
 *
 * No auto-fix: picking the right primitive (and the right slot) is a per-site
 * judgement, exactly like `no-adhoc-spacing`.
 *
 * Class strings are inspected only in a class-name context — a `className`/
 * `class` attribute value or a `cn(...)`/`clsx(...)`/`twMerge(...)` argument —
 * via the same `collectTokens` walk the sibling `no-adhoc-*` rules use, so a
 * doc-string that merely mentions `flex` is never flagged.
 */

// Position keywords. `relative`/`static` are NOT banned — they merely establish
// a positioning context (which Overlay owns) and are harmless on their own.
const POSITION = /^(?:absolute|fixed|sticky)$/;
// Inset offsets: `inset-0`, `inset-x-2`, `inset-y-full`, `inset-[3px]`. Guard the
// value so `inset-ring-*` (a box-shadow utility, not positioning) is NOT matched.
const INSET = /^inset(?:-x|-y)?-(?:\d|px|auto|full|\[)/;
// Flex family: `flex`, `inline-flex`, and every `flex-*` (flex-1/col/row/wrap/
// none/auto/initial/grow/shrink), plus `basis-*`.
const FLEX = /^(?:flex|inline-flex)$|^flex-|^basis-/;
// Grid family: `grid`, `inline-grid`, every `grid-*`, and grid placement
// (`col-span-*`, `col-start-*`, `row-end-*`, `col-auto`, …).
const GRID = /^(?:grid|inline-grid)$|^grid-|^(?:col|row)-(?:span|start|end|auto)/;
// Flex-child sizing. `flex-grow`/`flex-shrink` are already caught by FLEX.
const SHRINK_GROW = /^(?:shrink|grow)(?:-|$)/;
// The truncation-leaf footgun — min-width:0 at the wrong altitude is the churn.
// Only `min-w-0` (other `min-w-*` sizing is allowed).
const MIN_W_0 = /^min-w-0$/;
// Alignment / distribution.
const ALIGN = /^items-/;
const JUSTIFY = /^justify-/;
const SELF = /^self-/;
// `place-items|content|self-*` — the `(items|content|self)` guard keeps the
// regex off `placeholder-*` (a color utility), which also starts with `place`.
const PLACE = /^place-(?:items|content|self)-/;
// Overflow / clip — scroll-container concerns. A genuine scroll container is
// `<Scroll>` (the css/scroll primitive owns overflow + the flex-child fill
// policy); a clipped, non-scrolling box is `<Clip>`.
const OVERFLOW = /^overflow-/;

const LAYOUT_PATTERNS = [
  POSITION,
  INSET,
  FLEX,
  GRID,
  SHRINK_GROW,
  MIN_W_0,
  ALIGN,
  JUSTIFY,
  SELF,
  PLACE,
  OVERFLOW,
];

/** JSX attribute names whose value is a class-name string. */
const CLASS_ATTRS = new Set(["className", "class"]);
/** Class-builder calls whose string arguments are class-name strings. */
const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

/**
 * Recursively collect class tokens from a class-name value subtree into `out`.
 * Harvests only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions — splitting each on whitespace.
 * Structural (visit every child node) so it is robust to however the class
 * string is assembled (bare literal, template, `cn(...)`, ternaries, nesting).
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
 * Strip Tailwind variant prefixes (`hover:`, `md:`, …) AND a leading `-`
 * (negative insets like `-inset-1`) so the geometric utility underneath is
 * tested on its own. Variants are colon-delimited; the utility is the LAST
 * `:`-segment.
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  const bare = idx === -1 ? token : token.slice(idx + 1);
  return bare.startsWith("-") ? bare.slice(1) : bare;
}

export default createRule({
  name: "no-adhoc-layout",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw Tailwind layout utilities (flex/grid/positioning/alignment/overflow). Compose layout through the <Stack>/<Cluster>/<Row>/<Grid>/<Center>/<Overlay> and <Inset> primitives.",
    },
    schema: [],
    messages: {
      adhocLayout:
        "Raw layout class `{{token}}` is banned — compose layout through the primitives: " +
        "<Stack direction=\"row\">/<Cluster>/<Row> for horizontal rows, " +
        "<Grid>/<Center>/<Overlay> from @plugins/primitives/plugins/css/plugins/*, " +
        "<Stack gap>/<Inset pad> from @plugins/primitives/plugins/css/plugins/spacing/web, or <Text> " +
        "inside a line container for the min-w-0 truncation leaf. A genuine one-off escapes per-site with " +
        "`// eslint-disable-next-line layout/no-adhoc-layout -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    function checkTokens(node: TSESTree.Node, tokens: Set<string>) {
      for (const token of tokens) {
        const c = baseClass(token);
        if (LAYOUT_PATTERNS.some((re) => re.test(c))) {
          context.report({ node, messageId: "adhocLayout", data: { token: c } });
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !CLASS_ATTRS.has(node.name.name)) return;
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);
        checkTokens(node, tokens);
      },
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
