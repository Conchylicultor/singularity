import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Chrome-strip guardrail — the bar archetype's `no-adhoc-row` equivalent.
 *
 * A horizontal chrome strip (the app/pane toolbar band, a pane header) is a
 * single-line region with a bottom border at a fixed chrome height. Hand-rolling
 * it (`<div className="flex items-center border-b h-chrome-pane px-chrome">`)
 * re-derives the strip chrome and re-opens the wrap bug instead of composing the
 * one primitive that owns it. The sanctioned home is the `Bar` primitive
 * (`@plugins/primitives/plugins/bar/web`): `tier="chrome"` for app/pane
 * toolbars, `tier="pane"` for pane headers.
 *
 * Detection signature (a co-occurrence that may live across several `cn()`
 * fragments, so we aggregate every class token of one class-name context into a
 * Set first):
 *   - a chrome HEIGHT token (`h-chrome-bar` / `h-chrome-pane`) — worn ONLY by
 *     chrome bars and pane headers, the smoking gun, AND
 *   - `border-b`, AND
 *   - a centered single-line marker (`items-center`, or `region-line` which
 *     bakes it in).
 * A sidebar header also wears a chrome height but lacks BOTH `border-b` and the
 * centered marker (it is `justify-center`, borderless), so it is excluded.
 *
 * Layered with `pane-toolbar/no-adhoc-pane-toolbar`: that rule additionally
 * requires a *toolbar* (vs a plain Bar) to route through a render-slot host
 * (`definePaneToolbar` / `AppShellLayout`'s `toolbarSlot`) so its items are
 * contributions. This rule is the lower, structural layer: use `Bar` for any
 * chrome strip. The sanctioned `Bar` definition keeps its tier classes behind a
 * const map (not literal class-name tokens), so it never self-trips; it is also
 * path-exempted in the lint barrel for good measure.
 */

/** JSX attribute names whose value is a class-name string. */
const CLASS_ATTRS = new Set(["className", "class"]);
/** Class-builder calls whose string arguments are class-name strings. */
const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

/** The chrome HEIGHT tokens — worn only by chrome bars / pane headers. */
const CHROME_HEIGHT = new Set(["h-chrome-bar", "h-chrome-pane"]);
const BORDER_BOTTOM = "border-b";
/** Centered single-line markers: raw `items-center` or the `region-line` utility that bakes it in. */
const CENTER = new Set(["items-center", "region-line"]);

/**
 * Recursively collect class tokens from a class-name value subtree into `out`.
 * Harvests only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions — splitting each on whitespace.
 * Structural (visits every child) so it is robust to however the class string is
 * assembled (bare literal, template, `cn(...)`, ternaries, nesting). Identical
 * to the walk the sibling `no-adhoc-*` rules use.
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

/** Strip Tailwind variant prefixes (`hover:`, `md:`, …) so the base utility is tested alone. */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

/**
 * True when `node` sits inside a `className`/`class` JSX attribute. A
 * `className={cn(...)}` is walked by BOTH visitors, so the `CallExpression`
 * handler skips these to avoid double-reporting; a standalone `const c = cn(...)`
 * has no such ancestor and is still checked.
 */
function inClassAttribute(node: TSESTree.Node): boolean {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (
      cur.type === "JSXAttribute" &&
      cur.name.type === "JSXIdentifier" &&
      CLASS_ATTRS.has(cur.name.name)
    ) {
      return true;
    }
  }
  return false;
}

export default createRule({
  name: "no-adhoc-bar",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hand-rolled chrome bars (a chrome-height + border-b + centered strip). Route through the Bar primitive (tier=\"chrome\" for app/pane toolbars, tier=\"pane\" for pane headers).",
    },
    schema: [],
    messages: {
      adhocBar:
        "Hand-rolled chrome bar (chrome height + `border-b` + centered) — route through the `Bar` " +
        "primitive from @plugins/primitives/plugins/bar/web: `tier=\"chrome\"` for an app/pane " +
        "toolbar band, `tier=\"pane\"` for a pane header. A toolbar additionally routes through " +
        "`definePaneToolbar` / `AppShellLayout`'s `toolbarSlot` so its items are contributions. " +
        "If genuinely bespoke, `// eslint-disable-next-line bar/no-adhoc-bar -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    function check(node: TSESTree.Node, tokens: Set<string>) {
      const bases = new Set([...tokens].map(baseClass));
      let hasChromeHeight = false;
      let hasCenter = false;
      for (const b of bases) {
        if (CHROME_HEIGHT.has(b)) hasChromeHeight = true;
        if (CENTER.has(b)) hasCenter = true;
      }
      if (hasChromeHeight && bases.has(BORDER_BOTTOM) && hasCenter) {
        context.report({ node, messageId: "adhocBar" });
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !CLASS_ATTRS.has(node.name.name)) return;
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);
        check(node, tokens);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !CLASS_BUILDERS.has(node.callee.name)) {
          return;
        }
        if (inClassAttribute(node)) return;
        const tokens = new Set<string>();
        for (const arg of node.arguments) collectTokens(arg, tokens);
        check(node, tokens);
      },
    };
  },
});
