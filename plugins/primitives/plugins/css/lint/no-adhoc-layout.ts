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
 * Compose these through the layout primitives instead — one primitive per
 * mechanic, all under `@plugins/primitives/plugins/css/plugins/<name>/web`:
 *   - rows / flow:      `<Line>` (bare single-line strip) · `<Row>` (interactive
 *                       row) · `<Stack direction="row">` · `<Cluster>` (wrapping
 *                       chips) · `<Inline>` (chips mid-sentence)
 *   - columns / panes:  `<Column header body footer>` — rigid | flexible | rigid
 *   - space-sharing:    `<Fill>` — THE grow+shrink cell (`min-w-0 flex-1`) ·
 *                       `<Rigid>` — THE leaf that never shrinks (`shrink-0`) ·
 *                       `<Text>` inside a line container — THE truncation leaf
 *   - grids / centring: `<Grid minCellWidth>` · `<Center axis>`
 *   - overflow:         `<Scroll>` (scrolls) · `<Clip>` (clips, no scroll)
 *   - positioning:      `<Overlay>` (in-flow full-bleed layers) · `<Layer>` (ONE
 *                       standalone `absolute inset-0` child) · `<Pin to>`
 *                       (point-anchored child) · `<Sticky edge>` ·
 *                       `ViewportOverlay` (true `fixed inset-0`)
 *   - padding / gap:    `<Inset pad>` / `<Stack gap>` (css/plugins/spacing/web)
 *
 * When the element cannot be WRAPPED (a third-party `className`-only prop, a
 * Lexical `<ContentEditable>`, a raw `<img>`/`<svg>`/`<button>` leaf that must
 * ITSELF be the box), take the class string instead of the component:
 * `fillClasses(axis)`, `rigidClass()`, `layerClasses(opts)`, `insetClass(step)`.
 * Own the element ⇒ the component; don't own it ⇒ the class helper. Neither
 * supersedes the other.
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
 * `class`/`*ClassName` attribute value or a `cn(...)`/`clsx(...)`/`twMerge(...)`
 * argument — via the same `collectTokens` walk the sibling `no-adhoc-*` rules
 * use, so a doc-string that merely mentions `flex` is never flagged.
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
const GRID =
  /^(?:grid|inline-grid)$|^grid-|^(?:col|row)-(?:span|start|end|auto)/;
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

/**
 * JSX attribute names whose value is a class-name string. `className`/`class`
 * are React's and HTML's own; the `*ClassName` suffix is the pass-through
 * convention (`panelClassName`, `itemClassName`, `wrapperClassName`,
 * `trackClassName`) a component uses to forward classes to an inner element.
 * Those forwarded strings style a real element exactly like `className` does,
 * but were invisible to every class rule purely because of the attribute's
 * spelling.
 */
const CLASS_ATTRS = /^(?:class|className)$|ClassName$/;
/** Class-builder calls whose string arguments are class-name strings. */
const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

/**
 * Read a static string from a `style` ObjectExpression property's KEY, so both
 * `position` (Identifier) and `"position"` (string Literal) keys are matched.
 * Returns null for computed/dynamic keys (which we can't statically resolve).
 */
function staticPropKey(prop: TSESTree.Property): string | null {
  if (prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string")
    return prop.key.value;
  return null;
}

/**
 * Recursively collect class tokens from a class-name value subtree into `out`.
 * Harvests only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions — splitting each on whitespace.
 * Structural (visit every child node) so it is robust to however the class
 * string is assembled (bare literal, template, `cn(...)`, ternaries, nesting).
 */
function collectTokens(
  node: TSESTree.Node | null | undefined,
  out: Set<string>,
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
        "Disallow raw Tailwind layout utilities (flex/grid/positioning/alignment/overflow). Compose layout through the css layout primitives — <Line>/<Row>/<Stack>/<Cluster>/<Inline>, <Column>, <Fill>/<Rigid>/<Text>, <Grid>/<Center>, <Scroll>/<Clip>, <Overlay>/<Layer>/<Pin>/<Sticky>, <Inset> — or, when the element cannot be wrapped, their class-string helpers.",
    },
    schema: [],
    messages: {
      // The indexed list is HARDCODED, not derived from a registry: lint rules
      // dual-load under jiti, which cannot resolve `@plugins/*`. The
      // `css:message-names-primitives` check (plugins/primitives/plugins/css/check)
      // reads the css/plugins/* DIRECTORY LISTING and fails if a layout-mechanic
      // primitive is missing from this text, so the list cannot silently rot.
      adhocLayout:
        "Raw layout class `{{token}}` is banned — write the role, not the mechanics.\n" +
        "Pick the primitive that owns the mechanic (all under @plugins/primitives/plugins/css/plugins/<name>/web):\n" +
        '  rows / flow       <Line> single-line strip · <Row> interactive row · <Stack direction="row"> · <Cluster> wrapping chips · <Inline> chips mid-sentence\n' +
        "  columns / panes   <Column header body footer> — rigid | flexible | rigid, scrolling body\n" +
        "  space-sharing     <Fill> — THE grow+shrink cell (min-w-0 flex-1) · <Rigid> — THE leaf that never shrinks (shrink-0) · <Text> in a line container — THE truncation leaf\n" +
        "  grids / centring  <Grid minCellWidth> · <Center axis>\n" +
        "  overflow          <Scroll axis fill> scrolls · <Clip axis> clips, no scroll\n" +
        "  positioning       <Overlay> in-flow full-bleed layers · <Layer> ONE standalone absolute inset-0 child · <Pin to> point-anchored child · <Sticky edge> · ViewportOverlay for true fixed inset-0\n" +
        "  padding / gap     <Inset pad> · <Stack gap>  (css/plugins/spacing/web)\n" +
        "When you cannot wrap the element (a third-party `className` prop, a Lexical `ContentEditable`, a raw <img>/<svg>/<button> leaf that must ITSELF be the box), " +
        "take the class string instead: fillClasses(axis), rigidClass(), layerClasses({layer,decorative}), insetClass(step).\n" +
        "A genuine one-off escapes per-site with `// eslint-disable-next-line layout/no-adhoc-layout -- <reason>`.",
      adhocStylePosition:
        'Inline `position: "{{value}}"` is banned — anchor a cursor menu via CursorAnchoredMenu ' +
        "(@plugins/primitives/plugins/cursor-menu/web), collapse an overflowing bar via AdaptiveBar " +
        "(@plugins/primitives/plugins/adaptive-bar/web), or compose fixed/absolute through " +
        "<Overlay>/<Pin>/ViewportOverlay. Genuine one-off: " +
        "`// eslint-disable-next-line layout/no-adhoc-layout -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    function checkTokens(node: TSESTree.Node, tokens: Set<string>) {
      for (const token of tokens) {
        const c = baseClass(token);
        if (LAYOUT_PATTERNS.some((re) => re.test(c))) {
          context.report({
            node,
            messageId: "adhocLayout",
            data: { token: c },
          });
        }
      }
    }

    /**
     * Scan an inline `style={{ … }}` object for a banned `position` literal.
     *
     * Why inline style is scanned at all: the class-token ban above only reads
     * `className`/`cn()` strings, so the inline-`style` form
     * (`style={{ position: "fixed" }}`) slipped through entirely. That is the
     * exact unguarded path the desktop/window context-menu shift bug shipped on
     * (a zero-size `position: fixed` anchor that resolved against a transformed
     * ancestor instead of the viewport). We scope strictly to the `position`
     * property's string value — `relative`/`static` stay benign via POSITION,
     * and we deliberately ignore `top`/`left`/`inset`/etc. (legit offsets on a
     * sanctioned fixed/absolute child), since `position` is the discriminating
     * token. Dynamic values, spreads, and imperative `el.style.position` are not
     * caught — the same literal-only limit as the class path.
     */
    function checkStyle(node: TSESTree.JSXAttribute) {
      if (node.value?.type !== "JSXExpressionContainer") return;
      const expr = node.value.expression;
      if (expr.type !== "ObjectExpression") return;
      for (const prop of expr.properties) {
        if (prop.type !== "Property") continue;
        if (staticPropKey(prop) !== "position") continue;
        if (
          prop.value.type !== "Literal" ||
          typeof prop.value.value !== "string"
        )
          continue;
        const value = prop.value.value;
        if (POSITION.test(value)) {
          context.report({
            node: prop,
            messageId: "adhocStylePosition",
            data: { value },
          });
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (CLASS_ATTRS.test(node.name.name)) {
          const tokens = new Set<string>();
          collectTokens(node.value, tokens);
          checkTokens(node, tokens);
        } else if (node.name.name === "style") {
          checkStyle(node);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          !CLASS_BUILDERS.has(node.callee.name)
        ) {
          return;
        }
        const tokens = new Set<string>();
        for (const arg of node.arguments) collectTokens(arg, tokens);
        checkTokens(node, tokens);
      },
    };
  },
});
