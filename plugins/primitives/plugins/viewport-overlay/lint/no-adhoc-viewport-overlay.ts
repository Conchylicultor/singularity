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
 * Fingerprint: the co-occurrence of `fixed` + `inset-0` on an intrinsic
 * `span`/`div`/`button`/`a`, aggregated across one `className` attribute (the
 * tokens may live in different `cn()` fragments). Capitalized component tags
 * (e.g. base-ui `*.Backdrop` in the shadcn dialog/sheet, which portal via base-ui
 * Portal) are skipped by the host-tag gate. The primitive itself keeps the recipe
 * in a module const, so it is opaque to the token walk below.
 *
 * No auto-fix: deciding viewport (`<ViewportOverlay>`) vs. pane-relative
 * (`absolute inset-0`) is a per-site judgement (same stance as
 * `no-adhoc-surface` / `no-adhoc-zindex`).
 */

/**
 * Recursively collect class tokens from a `className` attribute value subtree.
 * Harvest only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers or member expressions (a returned string from a helper
 * function or a `MAP[x]` lookup is correctly treated as opaque). Each harvested
 * string is split on whitespace into the shared token Set. The walk is structural
 * (visit every child node) so it is robust to however the class string is
 * assembled (bare literal, cn(...)/clsx(...), template literal, ternary, …).
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
 * class underneath is tested on its own (`md:fixed` -> `fixed`).
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

const HOST_TAGS = new Set(["span", "div", "button", "a"]);

export default createRule({
  name: "no-adhoc-viewport-overlay",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ad-hoc viewport overlays (fixed + inset-0 on a span/div/button/a) — route through the <ViewportOverlay> primitive, which self-portals to document.body so it fills the real viewport regardless of any transformed ancestor.",
    },
    schema: [],
    messages: {
      adhocViewportOverlay:
        "Ad-hoc viewport overlay (`fixed` + `inset-0` on a span/div/button/a). " +
        "A transformed ancestor (`transform-gpu`, filter, will-change) becomes the " +
        "containing block and SILENTLY clips this to the content area. Route through " +
        "`<ViewportOverlay>` from `@plugins/primitives/plugins/viewport-overlay/web`, " +
        "which self-portals to `document.body` so it fills the real viewport. If you " +
        "meant a pane-relative overlay, use `absolute inset-0`; if intentionally " +
        "bespoke, `// eslint-disable-next-line viewport-overlay/no-adhoc-viewport-overlay -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Host-tag gate: require an intrinsic {span, div, button, a}. Skips
        // component elements (`<ViewportOverlay>`, base-ui `*.Backdrop`, …) —
        // they render through a primitive — and other intrinsics for free.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier" || !HOST_TAGS.has(tag.name)) return;

        const raw = new Set<string>();
        collectTokens(node.value, raw);
        const tokens = new Set([...raw].map(baseClass));

        if (tokens.has("fixed") && tokens.has("inset-0")) {
          context.report({ node, messageId: "adhocViewportOverlay" });
        }
      },
    };
  },
});
