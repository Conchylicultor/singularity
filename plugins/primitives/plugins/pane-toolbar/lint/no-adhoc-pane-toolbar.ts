import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Toolbar-host guardrail.
 *
 * A full-surface (`chrome: false`) pane has no built-in toolbar, so the easy
 * (wrong) move is to hand-roll a `<div className="… border-b … pr-floating-bar">`
 * header with the back button / title / actions written inline. That bar is then
 * invisible to the slot system: not extensible, not error-isolated, not
 * reorderable — exactly the drift this rule prevents. The sanctioned home is the
 * `definePaneToolbar` factory (`@plugins/primitives/plugins/pane-toolbar/web`),
 * whose `Host` owns the one toolbar `<header>` and renders reorderable slot
 * zones; app-level toolbars route through `AppShellLayout`'s `toolbarSlot`.
 *
 * Detection signature: a class-name carrying BOTH `border-b` and
 * `pr-floating-bar`. `pr-floating-bar` reserves space under the top-right
 * floating action bar — it is worn only by a top toolbar row, which makes the
 * pair a precise, low-false-positive fingerprint for "this is a toolbar bar."
 * The sanctioned hosts wear the same signature and are exempted by path in the
 * lint barrel's `ignores` (the same allowlist mechanism the other `no-adhoc-*`
 * rules use). Inspected only in a class-name context (a `className`/`class`
 * attribute or a `cn(...)`/`clsx(...)`/`twMerge(...)` argument) via the shared
 * `collectTokens` walk, so prose mentioning the classes is never flagged.
 */

/** JSX attribute names whose value is a class-name string. */
const CLASS_ATTRS = new Set(["className", "class"]);
/** Class-builder calls whose string arguments are class-name strings. */
const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

/** The two tokens that together fingerprint a hand-rolled toolbar bar. */
const BORDER_BOTTOM = "border-b";
const TOOLBAR_PAD = "pr-floating-bar";

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
 * `className={cn(...)}` is walked by BOTH visitors (the attribute's value
 * subtree reaches the `cn(...)` call, and the call fires on its own), so the
 * `CallExpression` handler skips these to avoid double-reporting — the
 * `JSXAttribute` handler already covers them. A standalone `const c = cn(...)`
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
  name: "no-adhoc-pane-toolbar",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hand-rolled toolbar bars (a `border-b` + `pr-floating-bar` header). Route a pane toolbar through the definePaneToolbar host or AppShellLayout's toolbarSlot.",
    },
    schema: [],
    messages: {
      adhocToolbarBar:
        "Hand-rolled toolbar bar (`border-b` + `pr-floating-bar`) is banned — a toolbar must " +
        "route through a render-slot host so its items are contributions (extensible, " +
        "error-isolated, reorderable). Use `definePaneToolbar` from " +
        "@plugins/primitives/plugins/pane-toolbar/web for a full-surface pane, or " +
        "`AppShellLayout`'s `toolbarSlot` for an app-level bar — never a hand-written header.",
    },
  },
  defaultOptions: [],
  create(context) {
    function check(node: TSESTree.Node, tokens: Set<string>) {
      const bases = new Set([...tokens].map(baseClass));
      if (bases.has(BORDER_BOTTOM) && bases.has(TOOLBAR_PAD)) {
        context.report({ node, messageId: "adhocToolbarBar" });
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
        // Skip calls inside a className attribute — the JSXAttribute handler
        // already walks into them; reporting here too would double-count.
        if (inClassAttribute(node)) return;
        const tokens = new Set<string>();
        for (const arg of node.arguments) collectTokens(arg, tokens);
        check(node, tokens);
      },
    };
  },
});
