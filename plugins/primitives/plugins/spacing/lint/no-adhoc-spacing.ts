import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Spacing-rhythm guardrail.
 *
 * Layout spacing must come from ONE closed set of roles — the 8-step density
 * spacing ramp (`none|2xs|xs|sm|md|lg|xl|2xl`), consumed through the `<Stack
 * gap>` / `<Inset pad>` primitives (`@plugins/primitives/plugins/spacing/web`)
 * or the matching `gap-<step>` / `p-<step>` `@utility` classes. Tailwind's raw
 * spacing scale exposes ~20 continuous steps per axis (plus `gap-[7px]`), so
 * hand-written `gap-2`/`px-3`/`mt-4` is exactly how spacing drifts when many
 * agents write UI in parallel: every call site picks a slightly different value.
 *
 * This rule fires on ANY element (spacing is set everywhere) and bans raw
 * Tailwind spacing — numeric (`gap-2`, `px-3`, `m-4`, `space-y-2`) or arbitrary
 * (`gap-[7px]`, `p-[5px]`) — across gap, padding, margin, and space-between.
 * The named `*-<step>` utilities (word-valued) are NOT raw and are allowed,
 * exactly the `z-base` vs `z-10` distinction. `mx-auto`/`my-auto` (centering,
 * word-valued) are likewise untouched.
 *
 * No auto-fix: picking a role (and whether to restructure a margin into a
 * Stack gap / Inset pad) is a per-site judgement.
 *
 * Class strings are inspected only in a class-name context — a `className`/
 * `class` attribute value or a `cn(...)`/`clsx(...)`/`twMerge(...)` argument —
 * via the same `collectTokens` walk the sibling `no-adhoc-*` rules use, so a
 * doc-string that merely mentions `gap-2` is never flagged.
 */

// Raw spacing utilities: a numeric step (`-2`, `-0.5`) or an arbitrary value
// (`-[7px]`). The named ramp steps (`gap-sm`, `p-md`, …) and `auto` start with a
// letter, so they never match.
const GAP = /^gap(?:-[xy])?-(?:\d|\[)/;
const PAD = /^p[xytrbl]?-(?:\d|\[)/;
const MARGIN = /^m[xytrbl]?-(?:\d|\[)/;
const SPACE = /^space-[xy]-(?:\d|\[)/;

/** JSX attribute names whose value is a class-name string. */
const CLASS_ATTRS = new Set(["className", "class"]);
/** Class-builder calls whose string arguments are class-name strings. */
const CLASS_BUILDERS = new Set(["cn", "clsx", "twMerge"]);

/**
 * Recursively collect class tokens from a class-name value subtree into `out`.
 * Harvests only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions — splitting each on whitespace.
 * Structural (visit every child node) so it is robust to however the class
 * string is assembled (bare literal, template, `cn(...)`, ternaries, nesting).
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
 * Strip Tailwind variant prefixes (`hover:`, `md:`, …) AND a leading `-`
 * (negative margins like `-mt-2`) so the geometric utility underneath is tested
 * on its own. Variants are colon-delimited; the utility is the LAST `:`-segment.
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  const bare = idx === -1 ? token : token.slice(idx + 1);
  return bare.startsWith("-") ? bare.slice(1) : bare;
}

export default createRule({
  name: "no-adhoc-spacing",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw Tailwind spacing (gap-/p-/m-/space- numerics and arbitrary values). Set layout spacing through <Stack gap>/<Inset pad> or the named *-<step> density utilities.",
    },
    schema: [],
    messages: {
      adhocSpacing:
        "Raw spacing class `{{token}}` is banned — set layout spacing through the " +
        "<Stack gap> / <Inset pad> primitives from @plugins/primitives/plugins/spacing/web, " +
        "or a named `*-<step>` utility (none|2xs|xs|sm|md|lg|xl|2xl) from the density spacing scale. " +
        "Margins should usually become a Stack gap or Inset pad rather than a raw margin.",
    },
  },
  defaultOptions: [],
  create(context) {
    function checkTokens(node: TSESTree.Node, tokens: Set<string>) {
      for (const token of tokens) {
        const c = baseClass(token);
        if (GAP.test(c) || PAD.test(c) || MARGIN.test(c) || SPACE.test(c)) {
          context.report({ node, messageId: "adhocSpacing", data: { token: c } });
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !CLASS_ATTRS.has(node.name.name)) return;
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);
        checkTokens(node, tokens);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !CLASS_BUILDERS.has(node.callee.name)) {
          return;
        }
        const tokens = new Set<string>();
        for (const arg of node.arguments) collectTokens(arg, tokens);
        checkTokens(node, tokens);
      },
    };
  },
});
