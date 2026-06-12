import { ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Icons passed into an `icon=`/`leading=` slot of an auto-sizing primitive are
 * sized by that primitive via the `icon-auto` `@utility` (1.15em, tracks the slot
 * font-size). Hardcoding a `size-*`/`h-*`/`w-*` class on the glyph overrides that,
 * breaking the density-aware sizing the slot is meant to own.
 *
 * SCOPE — deliberately conservative; ZERO false positives is the priority. Fires
 * ONLY when ALL of these hold:
 *
 *   1. The attribute name is `icon` or `leading`.
 *   2. Its value is a `JSXExpressionContainer` wrapping an INLINE `JSXElement`
 *      literal (e.g. `icon={<MdFoo className="size-3" />}`). Identifiers, calls,
 *      conditionals, fragments are skipped — we never trace a variable.
 *   3. The element that OWNS the attribute is one of the auto-sizing primitives in
 *      `AUTO_SIZING_PARENTS` (matched by opening-element identifier name). Aliased
 *      imports (e.g. `RowPrimitive`) are intentionally NOT matched — accepted
 *      false negative.
 *   4. The slotted element is a BARE GLYPH: no children (self-closing/empty) AND
 *      its tag is either `svg` or a Capitalized component (`MdX`/`Icon`/…), never
 *      a lowercase intrinsic host (`span`/`div`/…). This rejects layout-box and
 *      spacer wrappers without needing a react-icons name list.
 *   5. Its `className` carries a hardcoded size token (`size-\d`/`h-\d`/`w-\d`
 *      after variant-prefix strip), as harvested by the shared class-token walk
 *      below — which also resolves a same-file object/array MAP alias indexed in
 *      a class context (e.g. `cn(MAP[key])`), but NOT a bare string `const`.
 *
 * Report-only, no autofix. This is a convention aid, not a guarantee — see the
 * plugin CLAUDE.md.
 */

const SLOT_NAMES = new Set(["icon", "leading"]);

// Primitives whose slot containers apply the `icon-auto` utility. KEEP IN SYNC
// with the primitives whose slot containers apply the icon-auto utility (Badge,
// Row, LinkChip, ToggleChip, Breadcrumb). Matched by the owning opening-element
// identifier name string only — aliased re-imports are an accepted false negative.
const AUTO_SIZING_PARENTS = new Set(["Badge", "Row", "LinkChip", "ToggleChip", "Breadcrumb"]);

// Hardcoded icon-size markers: `size-3`, `size-3.5`, `h-4`, `w-4`, …. Numeric
// suffix required so `size-full`/`h-auto`/`w-fit` etc. are NOT matched.
const SIZE = /^size-\d/;
const H = /^h-\d/;
const W = /^w-\d/;

/**
 * Strip a leading Tailwind variant prefix (`hover:`, `md:`, `dark:`, …) so the
 * geometric class underneath is tested on its own.
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

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

export default createRule({
  name: "no-adhoc-slot-icon-size",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded size-*/h-*/w-* on a bare inline glyph passed to the icon=/leading= slot of an auto-sizing primitive (Badge/Row/LinkChip/ToggleChip/Breadcrumb) — the slot auto-sizes it via the icon-auto utility.",
    },
    schema: [],
    messages: {
      adhocSlotIconSize:
        "Icon in an `icon=`/`leading=` slot is auto-sized by the primitive (icon-auto). " +
        "Remove the hardcoded size-*/h-*/w-* class; pass an explicit size only as a deliberate override.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        // 1. Slot gate: `icon=` or `leading=`.
        if (node.name.type !== "JSXIdentifier" || !SLOT_NAMES.has(node.name.name)) return;

        // 3. Parent allow-list: the element that owns this attribute must be one
        // of the auto-sizing primitives. The attribute's parent is always the
        // JSXOpeningElement; match its identifier name.
        const ownerTag = node.parent.name;
        if (ownerTag.type !== "JSXIdentifier" || !AUTO_SIZING_PARENTS.has(ownerTag.name)) return;

        // 2. Only an inline JSX element literal: `icon={<MdFoo .../>}`. Skip
        // identifiers, calls, conditionals, fragments — no variable tracing.
        if (node.value?.type !== "JSXExpressionContainer") return;
        const expr = node.value.expression;
        if (expr.type !== "JSXElement") return;

        // 4. The slotted element must be a BARE GLYPH:
        //   - no children (self-closing or empty body) — rejects layout-box
        //     wrappers like `<span className="size-3"><MdCheck/></span>`, and
        //   - tag is `svg` or a Capitalized component — rejects lowercase
        //     intrinsic host spacers/boxes (`<span/>`, `<div/>`).
        if (expr.children.length > 0) return;
        const slotTag = expr.openingElement.name;
        if (slotTag.type !== "JSXIdentifier") return;
        const isGlyph = slotTag.name === "svg" || /^[A-Z]/.test(slotTag.name);
        if (!isGlyph) return;

        // 5. Find a `className` attribute with an analyzable literal value in the
        // inline element's opening tag.
        const classAttr = expr.openingElement.attributes.find(
          (a): a is TSESTree.JSXAttribute =>
            a.type === "JSXAttribute" &&
            a.name.type === "JSXIdentifier" &&
            a.name.name === "className",
        );
        if (!classAttr) return;

        const tokens = new Set<string>();
        collectTokens(context.sourceCode, classAttr.value, tokens);
        if (tokens.size === 0) return; // not a simple analyzable className — skip.

        const hasHardcodedSize = [...tokens].some((t) => {
          const c = baseClass(t);
          return SIZE.test(c) || H.test(c) || W.test(c);
        });
        if (!hasHardcodedSize) return;

        context.report({ node, messageId: "adhocSlotIconSize" });
      },
    };
  },
});
