import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * A hand-rolled `fixed inset-0` div means "fill the viewport" — but several app
 * surfaces deliberately put `transform-gpu` (or another transform / filter /
 * will-change) on a container to scope `position: fixed` app chrome. Any
 * `fixed inset-0` descendant of such a container is then bounded by it and
 * SILENTLY clipped to the content area (below the tab bar, right of the rail),
 * with no error — it only shows up as a wrong-looking screenshot. The ancestor
 * relationship is a runtime DOM fact that crosses plugin boundaries, so it can't
 * be checked statically; instead we fingerprint the viewport-fill recipe and
 * redirect it to the `<ViewportOverlay>` primitive, which self-portals to
 * `document.body` and is therefore correct regardless of any transformed
 * ancestor.
 *
 * Fingerprint: the co-occurrence of `fixed` + `inset-0`, aggregated across one
 * class-name attribute (the tokens may live in different `cn()` fragments) or
 * one `cn`/`clsx`/`twMerge` call. Both anchors matter — the recipe is just as
 * wrong when it is built into a `const c = cn("fixed", "inset-0")` and spread
 * onto an element a few lines later.
 *
 * The gate is the *recipe*, not the host tag. The literal recipe is illegal on
 * ANY host element — an intrinsic (`<div>`/`<section>`/`<main>`/`<nav>`/…), a
 * capitalized layout component, or a member-expression tag (`<Foo.Bar>`). The
 * former `HOST_TAGS` gate was `span`/`div`/`button`/`a`, so `<section className=
 * "fixed inset-0">` sailed past it — a tag-allowlist fails open, and its sibling
 * `no-adhoc-surface` already deleted its identical gate for that reason.
 *
 * Two legitimate homes for the recipe survive that, both by construction rather
 * than by an allowlist of tags:
 *
 *   1. The primitive itself keeps the recipe in a module const, so it is opaque
 *      to the literal-only token walk below.
 *   2. The base-ui `*.Popup` / `*.Backdrop` tags in the shadcn dialog/sheet DO
 *      fill the real viewport correctly — base-ui portals them — but they spell
 *      the recipe as literals, so they are exempted by a file-glob in
 *      `lint/index.ts`, exactly as `no-adhoc-surface` exempts the same files.
 *
 * No auto-fix: deciding viewport (`<ViewportOverlay>`) vs. pane-relative
 * (`absolute inset-0`) is a per-site judgement (same stance as
 * `no-adhoc-surface` / `no-adhoc-zindex`).
 */

/**
 * Recursively collect class tokens from a class-name value subtree.
 * Harvest only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers or member expressions (a returned string from a helper
 * function or a `MAP[x]` lookup is correctly treated as opaque). Each harvested
 * string is split on whitespace into the shared token Set. The walk is structural
 * (visit every child node) so it is robust to however the class string is
 * assembled (bare literal, cn(...)/clsx(...), template literal, ternary, …).
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
 * Strip Tailwind variant prefixes (`hover:`, `md:`, `dark:`, …) so the geometric
 * class underneath is tested on its own (`md:fixed` -> `fixed`).
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

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

export default createRule({
  name: "no-adhoc-viewport-overlay",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ad-hoc viewport overlays (fixed + inset-0 on any host element, or in a cn()/clsx() call) — route through the <ViewportOverlay> primitive, which self-portals to document.body so it fills the real viewport regardless of any transformed ancestor.",
    },
    schema: [],
    messages: {
      adhocViewportOverlay:
        "Ad-hoc viewport overlay (`fixed` + `inset-0`). " +
        "A transformed ancestor (`transform-gpu`, filter, will-change) becomes the " +
        "containing block and SILENTLY clips this to the content area. Route through " +
        "`<ViewportOverlay>` from `@plugins/primitives/plugins/css/plugins/viewport-overlay/web`, " +
        "which self-portals to `document.body` so it fills the real viewport. If you " +
        "meant a pane-relative overlay, use `absolute inset-0`; if intentionally " +
        "bespoke, `// eslint-disable-next-line viewport-overlay/no-adhoc-viewport-overlay -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    /** Report `node` when the collected tokens spell the viewport-fill recipe. */
    function checkTokens(node: TSESTree.Node, raw: Set<string>): void {
      const tokens = new Set([...raw].map(baseClass));
      if (tokens.has("fixed") && tokens.has("inset-0")) {
        context.report({ node, messageId: "adhocViewportOverlay" });
      }
    }

    return {
      JSXAttribute(node) {
        if (
          node.name.type !== "JSXIdentifier" ||
          !CLASS_ATTRS.test(node.name.name)
        )
          return;

        // No host-tag gate: the recipe is the violation on ANY host element.
        // The sanctioned homes are invisible here for structural reasons, not
        // because of an allowlist — the primitive keeps the recipe in a module
        // const the literal-only walk never harvests, and the base-ui portaled
        // surfaces are exempted by a file-glob in lint/index.ts.
        const raw = new Set<string>();
        collectTokens(node.value, raw);
        checkTokens(node, raw);
      },
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          !CLASS_BUILDERS.has(node.callee.name)
        )
          return;

        // A class string assembled outside a JSX attribute (`const c = cn("fixed",
        // "inset-0")`) lands on a real element all the same, so the builder call
        // is its own anchor — mirroring no-adhoc-layout / no-adhoc-spacing.
        const raw = new Set<string>();
        for (const arg of node.arguments) collectTokens(arg, raw);
        checkTokens(node, raw);
      },
    };
  },
});
