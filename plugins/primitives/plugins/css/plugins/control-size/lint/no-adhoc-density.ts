import { ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Density-control guardrail.
 *
 * The density-participating control primitives (`Button`, `IconButton`,
 * `Badge`, `ToggleChip`, `Avatar`, …) derive their size from the ambient
 * `ControlSize` context (`useControlSize()`), set ONCE on a region via
 * `<ControlSizeProvider size>` or a size-owning slot's `controlSize`. They have
 * NO per-instance density: there is no `size` prop, and there's no hand-written
 * height class either.
 *
 * This rule fingerprints the two ways that ambient density is escaped per
 * instance — both relocations of the same removed `size` prop:
 *
 *   - A `size=` prop on a density primitive. The type lock (`size?: never`)
 *     already removes it; this rule catches it at the lint layer (and on aliased
 *     re-imports the type lock can't see).
 *
 *   - A fixed height/size class on a density primitive: a `className` carrying a
 *     `h-N`/`size-N`/`control-*`/`control-icon-*` base-class. `className="size-6"`
 *     IS the `xs` control height written by hand — the same per-instance density
 *     escape, just moved to the class string. Height is ambient, so a per-instance
 *     override desyncs the control from its neighbors. Only digit-led `h-`/`size-`
 *     and the `control-*` scale match — `min-h-0`, `h-auto`, `h-full`, `size-full`,
 *     fixed *width* (`w-N`), margins, and colors stay legal; only height/density is
 *     owned by the scale.
 *
 * Primitives are matched by opening-element identifier name only — an aliased
 * import is an accepted false negative, mirroring the sibling no-adhoc-* rules.
 * No auto-fix: removing the override + setting region density is unsafe to
 * mechanize.
 */

// KEEP IN SYNC with the primitives that intersect `DensityControlled` (the
// density-participating control primitives that derive size from useControlSize).
const DENSITY_PRIMITIVES = new Set([
  "Button", "IconButton", "PaneIconAction",
  "Badge", "ToggleChip", "SegmentedControl",
  "LinkChip", "FilterChip",
  "Avatar", "StatusDot", "BouncingDots",
]);

// Per-instance height/density markers (base-class-stripped). A per-instance
// height IS the relocated density escape. Numeric suffix required for h-/size-
// so `h-auto`, `h-full`, `size-full`, widths, margins, colors stay legal.
const FIXED_HEIGHT = /^h-\d/;
const FIXED_SIZE = /^size-\d/;
const CONTROL_SCALE = /^control-(xs|sm|md|lg)$/;
const CONTROL_ICON_SCALE = /^control-icon-(xs|sm|md|lg)$/;

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
  name: "no-adhoc-density",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a per-instance density/size override (a size= prop or a fixed h-*/size-*/control-* class) on the density-participating control primitives (Button/IconButton/Badge/ToggleChip/Avatar/…). They derive size from ambient control density; set it once per region via <ControlSizeProvider size> or a slot's controlSize.",
    },
    schema: [],
    messages: {
      densitySizeProp:
        "Density control primitives derive size from ambient control density — they have no per-instance `size`. Remove the `size` prop and set density on the region via `<ControlSizeProvider size>` (or a slot's `controlSize`).",
      densitySizeClass:
        "Height/size comes from ambient control density, not a per-instance class. Drop the `h-*`/`size-*`/`control-*` and set density on the region via `<ControlSizeProvider size>` (or a slot's `controlSize`).",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") return;

        // The attribute's parent is always the JSXOpeningElement; match its
        // identifier name against the density-primitive allowlist. Aliased
        // imports are an accepted false negative.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier") return;
        if (!DENSITY_PRIMITIVES.has(tag.name)) return;

        // A `size=` prop is the per-instance density escape directly.
        if (node.name.name === "size") {
          context.report({ node, messageId: "densitySizeProp" });
          return;
        }

        // A fixed height/size/control-* class is the relocated density escape.
        if (node.name.name === "className") {
          const tokens = new Set<string>();
          collectTokens(context.sourceCode, node.value, tokens);
          const hasDensityClass = [...tokens].some((t) => {
            const c = baseClass(t);
            return (
              FIXED_HEIGHT.test(c) ||
              FIXED_SIZE.test(c) ||
              CONTROL_SCALE.test(c) ||
              CONTROL_ICON_SCALE.test(c)
            );
          });
          if (hasDensityClass) context.report({ node, messageId: "densitySizeClass" });
          return;
        }
      },
    };
  },
});
