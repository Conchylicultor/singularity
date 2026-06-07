import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

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
 * Neither check has an auto-fix: choosing the right primitive + size variant and
 * adding the import are unsafe to mechanize.
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

const HOST_TAGS = new Set(["button", "a"]);

export default createRule({
  name: "no-adhoc-control",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow divergent/hand-rolled controls: importing buttonVariants, or a raw button/a styled with fixed height + horizontal padding + rounded. Size controls through <Button>/<IconButton>/<ButtonGroup> and the shared control-* scale.",
    },
    schema: [],
    messages: {
      noButtonVariants:
        "Do not import `buttonVariants`. Style through the <Button> primitive (or <ButtonGroup> for split/segmented controls); applying buttonVariants to a non-button element is the divergence escape hatch this rule prevents.",
      adhocControl:
        "Hand-rolled button detected (fixed height + horizontal padding + rounded). Use <Button>/<IconButton> for actions, or <ButtonGroup> for split/segmented controls, so size comes from the shared control-size scale.",
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

      // Check B — ban hand-rolled buttons (raw <button>/<a> styled like a control).
      JSXAttribute(node) {
        // Only `className` attributes.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Host-tag gate: a JSXAttribute's parent is always the JSXOpeningElement.
        // Require an intrinsic host tag in {button, a}. This skips component
        // elements (`<Button>`, capitalized — already a primitive) for free.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier" || !HOST_TAGS.has(tag.name)) return;

        // Aggregate every class token of this attribute into one Set, stripping
        // variant prefixes so `hover:rounded-full` etc. count as their base.
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);

        const hasHeight = [...tokens].some((t) => {
          const c = baseClass(t);
          return FIXED_HEIGHT.test(c) || FIXED_SIZE.test(c);
        });
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
