import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Ad-hoc surface markup reinvents the elevation bundle the `<Surface>` primitive
 * (and its `<Card>` / overlay wrappers) exists to freeze. Each open-coded
 * `bg-card`/`bg-popover` + border/ring + shadow + radius recipe drifts a little —
 * which is exactly why a theme/preset swap can only repaint colors, never fix the
 * flat, inconsistent depth. This rule fingerprints the two *disambiguable*
 * recipes and redirects them to a semantic level.
 *
 * The gate is the *recipe*, not the host tag. The literal recipe is illegal on
 * ANY host element — an intrinsic (`<div>`/`<section>`/`<nav>`/…), a capitalized
 * layout component (`<Stack>`/`<SortableItem>`/…), or a member-expression tag
 * (`<Foo.Bar>`). A surface recipe smuggled through a layout component's
 * `className` is exactly the drift this rule exists to stop, so there is no
 * tag-allowlist to fail open through (the former `HOST_TAGS` gate did just that).
 *
 * Two fingerprints, each a co-occurrence of classes that may live in different
 * `cn()` fragments — so we aggregate every class token of one `className`
 * attribute into a single Set and test against it:
 *
 *   - `raised`  — `rounded` + `border` + the card-surface token `bg-card` +
 *                 padding → `<Surface level="raised">` / `<Card>`. (This is the
 *                 former `no-adhoc-card` fingerprint, folded in here.)
 *   - `overlay` — `bg-popover` + a `shadow-*` + `rounded` →
 *                 `<Surface level="overlay">` / `PopoverContent`.
 *
 * Two legitimate homes for the recipe, both invisible to this gate:
 *
 *   1. The `SURFACE_LEVELS` member-access indirection — `cn(SURFACE_LEVELS.raised,
 *      …)` reads the bundle off a member expression, never a string literal. This
 *      is load-bearing: `collectTokens` harvests ONLY string-`Literal` /
 *      `TemplateElement` values, so a map-driven class is opaque and the canonical
 *      sanctioned surface flows straight through. The literal-only walk IS the
 *      escape valve.
 *   2. The surface-primitive *definition* files under `ui-kit/web/components/ui/`
 *      — the shadcn primitives that open-code the recipe as literal strings on
 *      base-ui `*.Popup` member tags (they ARE the implementation behind
 *      `<Surface level="overlay">` / `PopoverContent`). They own the raw recipe and
 *      are exempted by a file-glob in `lint/index.ts`, exactly as `no-adhoc-layout`
 *      exempts the layout primitives that own raw mechanics.
 *
 * We DON'T fingerprint `base` (`bg-background`) or `sunken` (`bg-muted`): those
 * tokens legitimately appear on dividers, hover states, chips, drop-zones and
 * bands without being a contained surface, so there's no false-positive-free
 * signal. They're offered as `<Surface>` levels but not hard-linted — same
 * reasoning the card rule gave for keying on `bg-card`, not the broader tokens.
 *
 * No auto-fix: mapping bespoke chrome to a `<Surface>` level + import is a
 * per-site judgement (same stance as `no-adhoc-control` / `no-adhoc-zindex`).
 */

// radius: `rounded`, `rounded-sm`…`rounded-4xl` (NOT rounded-full/none/checkbox —
// those aren't surface radii).
const ROUNDED = /^rounded(-(sm|md|lg|xl|2xl|3xl|4xl))?$/;
// surface backgrounds — the dedicated card / popover tokens (NOT bg-muted/bg-background).
const BG_CARD = /^bg-card$/;
const BG_POPOVER = /^bg-popover$/;
// elevation shadow: `shadow`, `shadow-sm`…`shadow-2xl` (NOT shadow-none/inner).
const SHADOW = /^shadow(-(2xs|xs|sm|md|lg|xl|2xl))?$/;
// padding tokens (raised fingerprint).
const P_NUM = /^p-\d/; // p-3, p-2, …
const P_ARBITRARY = /^p-\[/; // p-[…]
// Named density-ramp padding (`p-sm`…`p-2xl`) — the sanctioned word-valued
// spacing utilities (see no-adhoc-spacing, which *allows* these). They ARE card
// padding; omitting them let a `bg-card` + rounded + border + `p-lg` card slip the
// raised fingerprint. `p-none` (zero) is excluded — a zero-padded box isn't padded.
const P_RAMP = /^p-(2xs|xs|sm|md|lg|xl|2xl)$/;
const PX = /^px-/;
const PY = /^py-/;
// named padding token (`p-card`) — the sanctioned token escape, parallel to `p-row`.
const P_CARD = "p-card";

/**
 * Recursively collect class tokens from a `className` attribute value subtree.
 * Harvest only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions (e.g. a `SURFACE_LEVELS.overlay`
 * member access or a `STATE_STYLES[x]` lookup), so map-driven classes are
 * correctly treated as opaque. Each harvested string is split on whitespace into
 * the shared token Set. The walk is structural (visit every child node) rather
 * than shape-specific, so it is robust to however the class string is assembled
 * (bare literal, cn(...)/clsx(...), template literal, ternary, …).
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
 * Strip Tailwind variant prefixes (`hover:`, `md:`, `dark:`, …) so the geometric
 * class underneath is tested on its own (`hover:rounded-lg` -> `rounded-lg`).
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

export default createRule({
  name: "no-adhoc-surface",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow the ad-hoc surface recipe (raised: rounded + border + bg-card + padding; overlay: bg-popover + shadow + rounded) on any host element — route through the <Surface> primitive (or <Card> / PopoverContent), which freeze the semantic elevation bundle.",
    },
    schema: [],
    messages: {
      adhocRaised:
        "Ad-hoc raised-surface recipe (rounded + border + the card-surface token `bg-card` + " +
        "padding) — flagged on any host element (intrinsic, layout component, or member tag). " +
        "Route through `<Surface level=\"raised\">` (or `<Card>`) from " +
        "`@plugins/primitives/plugins/css/plugins/surface/web`, which freezes the raised bundle " +
        "and bakes in the Ctrl+A select-scope. If intentionally bespoke, " +
        "use the named padding token (`p-card`), or " +
        "`// eslint-disable-next-line surface/no-adhoc-surface -- <reason>`.",
      adhocOverlay:
        "Ad-hoc overlay-surface recipe (the `bg-popover` token + a shadow + rounded) — " +
        "flagged on any host element (intrinsic, layout component, or member tag). " +
        "Route through `<Surface level=\"overlay\">` from " +
        "`@plugins/primitives/plugins/css/plugins/surface/web` (or `PopoverContent`/`DropdownMenuContent`), which " +
        "freeze the overlay bundle. If intentionally bespoke, " +
        "`// eslint-disable-next-line surface/no-adhoc-surface -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // No host-tag gate: the literal recipe is the violation on ANY host
        // element. The sanctioned surfaces are invisible here for structural
        // reasons, not because of an allowlist — `SURFACE_LEVELS.*` reads off a
        // member expression `collectTokens` never harvests, and the shadcn
        // primitive definition files are exempted by a file-glob in lint/index.ts.
        const raw = new Set<string>();
        collectTokens(node.value, raw);
        const tokens = new Set([...raw].map(baseClass));

        let hasRounded = false;
        let hasBorder = false;
        let hasCardBg = false;
        let hasPopoverBg = false;
        let hasShadow = false;
        let hasPadding = false;
        let hasPx = false;
        let hasPy = false;
        let pCardEscape = false;
        for (const t of tokens) {
          if (ROUNDED.test(t)) hasRounded = true;
          if (t === "border") hasBorder = true;
          if (BG_CARD.test(t)) hasCardBg = true;
          if (BG_POPOVER.test(t)) hasPopoverBg = true;
          if (SHADOW.test(t)) hasShadow = true;
          if (P_NUM.test(t) || P_ARBITRARY.test(t) || P_RAMP.test(t)) hasPadding = true;
          if (PX.test(t)) hasPx = true;
          if (PY.test(t)) hasPy = true;
          if (t === P_CARD) pCardEscape = true;
        }
        if (hasPx && hasPy) hasPadding = true;

        // overlay fingerprint (checked first — bg-popover is unambiguous).
        if (hasPopoverBg && hasShadow && hasRounded) {
          context.report({ node, messageId: "adhocOverlay" });
          return;
        }
        // raised fingerprint (the former no-adhoc-card), with the p-card escape.
        if (!pCardEscape && hasRounded && hasBorder && hasCardBg && hasPadding) {
          context.report({ node, messageId: "adhocRaised" });
        }
      },
    };
  },
});
