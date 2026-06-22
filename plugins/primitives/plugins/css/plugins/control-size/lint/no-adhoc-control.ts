import { ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Control-size standardization guardrail.
 *
 * Every interactive control's height must come from ONE source of truth: the
 * shared `control-*` height scale, applied through the sanctioned primitives.
 * `<Button>`/`<IconButton>` (single actions) and `<ButtonGroup>` (split /
 * segmented controls) are the ONLY way to size a control — they read the
 * `control-*` scale internally, so a control's chrome (height, padding, radius)
 * stays consistent across the whole app and moves in lockstep when the scale
 * changes.
 *
 * Two divergence escape hatches reintroduce the inconsistency the primitives
 * exist to close, and this rule fingerprints both:
 *
 *   A. Importing `buttonVariants` to paint a non-button element to look like a
 *      button — the "style anything like a button" hatch. The class string it
 *      emits is opaque to lint, so the only durable guard is banning the import.
 *      `button.tsx` DEFINES `buttonVariants` locally (via `cva`) rather than
 *      importing it, so it never trips this check; nothing else legitimately
 *      imports it.
 *
 *   B. Hand-rolling a button: a raw `<button>`/`<a>` styled with a fixed height
 *      + horizontal padding + rounded corners — the geometric signature of a
 *      control whose size was authored by hand instead of inherited from the
 *      `control-*` scale. An icon-only `p-0.5 rounded` close button has no fixed
 *      height and no horizontal padding, so it is NOT flagged here — that shape
 *      stays the domain of `badge/no-adhoc-chip` / `row`.
 *
 *   C. A fixed-height class on the `<Button>`/`<IconButton>` PRIMITIVES — a
 *      `className` carrying a `h-N`/`size-N` base-class. The type lock
 *      (`size?: never`) removed the `size` *prop*, but `className="size-6"` IS
 *      the `xs` control height written by hand: the same per-instance density
 *      escape, just relocated to the class string. Height is ambient (set once
 *      on the region via `<ControlSizeProvider size>` or a slot's `controlSize`),
 *      so a per-instance height override desyncs the control from its neighbors.
 *      Only digit-led `h-`/`size-` match — `min-h-0`, `h-auto`, `h-full`, and
 *      fixed *width* (`w-N`, on a text button) stay legal; only height is owned
 *      by the scale.
 *
 * None of these checks has an auto-fix: choosing the right primitive + region
 * density and adding the import are unsafe to mechanize.
 */

// Fixed-height marker: `h-7`, `h-6`, … or the `size-*` shorthand `size-8`, ….
const FIXED_HEIGHT = /^h-\d/;
const FIXED_SIZE = /^size-\d/;
// Horizontal padding: `px-*`, `pl-*`, or `pr-*`.
const PX = /^px-/;
const PL = /^pl-/;
const PR = /^pr-/;
// Rounded corner: `rounded`, `rounded-md`, `rounded-full`, ….
const ROUNDED = /^rounded(-|$)/;

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

const HOST_TAGS = new Set(["button", "a"]);
// Sanctioned control PRIMITIVES whose height is ambient — a per-instance fixed
// height/size class on either is the relocated density escape (Check C).
const CONTROL_COMPONENTS = new Set(["Button", "IconButton"]);

export default createRule({
  name: "no-adhoc-control",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow divergent/hand-rolled controls: importing buttonVariants, a raw button/a styled with fixed height + horizontal padding + rounded, or a fixed h-*/size-* class on the <Button>/<IconButton> primitives. Size controls through <Button>/<IconButton>/<ButtonGroup> and the shared control-* scale, set once per region.",
    },
    schema: [],
    messages: {
      noButtonVariants:
        "Do not import `buttonVariants`. Style through the <Button> primitive (or <ButtonGroup> for split/segmented controls); applying buttonVariants to a non-button element is the divergence escape hatch this rule prevents.",
      adhocControl:
        "Hand-rolled button detected (fixed height + horizontal padding + rounded). Use <Button>/<IconButton> for actions, or <ButtonGroup> for split/segmented controls, so size comes from the shared control-size scale.",
      adhocControlSize:
        "Height comes from ambient control density, not a per-instance class. Drop the `h-*`/`size-*` and set density on the region via `<ControlSizeProvider size>` (or a slot's `controlSize`).",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Check A — ban `buttonVariants` imports from the button primitive.
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== "string") return;
        // Match the canonical `@/components/ui/button` and any specifier that
        // resolves to the same module (e.g. a relative `../components/ui/button`).
        if (source !== "@/components/ui/button" && !source.endsWith("/components/ui/button")) {
          return;
        }
        for (const spec of node.specifiers) {
          if (
            spec.type === "ImportSpecifier" &&
            spec.imported.type === "Identifier" &&
            spec.imported.name === "buttonVariants"
          ) {
            context.report({ node: spec, messageId: "noButtonVariants" });
          }
        }
      },

      // Checks B + C — both inspect a `className` attribute, differing only on
      // the owning JSX tag.
      JSXAttribute(node) {
        // Only `className` attributes.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // A JSXAttribute's parent is always the JSXOpeningElement.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier") return;

        // Aggregate every class token of this attribute into one Set, stripping
        // variant prefixes so `hover:rounded-full` etc. count as their base.
        const tokens = new Set<string>();
        collectTokens(context.sourceCode, node.value, tokens);

        const hasHeight = [...tokens].some((t) => {
          const c = baseClass(t);
          return FIXED_HEIGHT.test(c) || FIXED_SIZE.test(c);
        });

        // Check C — a fixed height/size class on the <Button>/<IconButton>
        // primitives (capitalized component tags). Height is ambient; a
        // per-instance class here is the relocated density escape.
        if (CONTROL_COMPONENTS.has(tag.name)) {
          if (hasHeight) context.report({ node, messageId: "adhocControlSize" });
          return;
        }

        // Check B — ban hand-rolled buttons (raw <button>/<a> styled like a
        // control). Require an intrinsic host tag in {button, a}.
        if (!HOST_TAGS.has(tag.name)) return;

        const hasPadX = [...tokens].some((t) => {
          const c = baseClass(t);
          return PX.test(c) || PL.test(c) || PR.test(c);
        });
        const hasRounded = [...tokens].some((t) => ROUNDED.test(baseClass(t)));

        // Fingerprint: flag only when ALL THREE co-occur.
        if (!hasHeight || !hasPadX || !hasRounded) return;

        context.report({ node, messageId: "adhocControl" });
      },
    };
  },
});
