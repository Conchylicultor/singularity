import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Ad-hoc card markup — an intrinsic `<span>/<div>/<button>/<a>` styled with a
 * `rounded` corner PLUS a `border` PLUS the card-surface token `bg-card` PLUS a
 * padding token — reinvents the card shell the `<Card>` primitive exists to
 * close (and to auto-apply the Ctrl+A select-scope). This rule fingerprints that
 * shape and redirects to `<Card>`. There is no auto-fix: mapping the bespoke
 * chrome to `<Card>` props/className and adding the import are unsafe to
 * mechanize.
 *
 * We key on `bg-card` specifically — the dedicated "card surface" theme token —
 * NOT the broader `bg-muted`/`bg-background`, which panels, rows, chips, and
 * drop-zones legitimately use without being cards. Using `bg-card` IS the
 * declaration "this is a card surface", so it's the precise card signal and
 * matches `<Card>`'s own BASE chrome.
 *
 * The fingerprint is a *co-occurrence* of several classes that may live in
 * different `cn()` fragments. So we aggregate every class token of one
 * `className` attribute into a single Set, then test the fingerprint against it.
 */

// radius: `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`.
const ROUNDED = new Set(["rounded", "rounded-sm", "rounded-md", "rounded-lg", "rounded-xl"]);
// card surface: the dedicated `bg-card` token (NOT bg-muted/bg-background).
const BG_CARD = /^bg-card$/;
// padding tokens.
const P_NUM = /^p-\d/; // p-3, p-2, …
const P_ARBITRARY = /^p-\[/; // p-[…]
const PX = /^px-/;
const PY = /^py-/;
// named padding token (`p-card`) — the sanctioned token escape, parallel to
// `p-row`. `p-[a-z]` avoids matching numeric `p-2`.
const P_CARD = "p-card";

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

const HOST_TAGS = new Set(["span", "div", "button", "a"]);

export default createRule({
  name: "no-adhoc-card",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ad-hoc card markup (rounded + border + bg-card + padding on a span/div/button/a) — use the <Card> primitive, which bakes in the Ctrl+A select-scope.",
    },
    schema: [],
    messages: {
      adhocCard:
        "Ad-hoc card markup (rounded + border + the card-surface token `bg-card` + " +
        "padding on a span/div/button/a) — route through `<Card>` from " +
        "`@plugins/primitives/plugins/card/web`, which centralizes the card shell and auto-applies the " +
        "Ctrl+A select-scope. If intentionally bespoke, render through a component, use the named " +
        "padding token (`p-card`), or `// eslint-disable-next-line card/no-adhoc-card -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        // Only `className` attributes.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Host-tag gate: a JSXAttribute's parent is always the JSXOpeningElement.
        // Require an intrinsic host tag in {span, div, button, a}. This skips
        // component elements (`<Card>`, `<Foo>` — capitalized, render through a
        // primitive) and other intrinsics (`<code>`, `<input>`) for free.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier" || !HOST_TAGS.has(tag.name)) return;

        // Aggregate every class token of this attribute into one Set.
        const tokens = new Set<string>();
        collectTokens(node.value, tokens);

        // Fingerprint: flag only when ALL of {rounded, border, card-ish bg,
        // padding} hold.
        let hasRounded = false;
        let hasBorder = false;
        let hasCardBg = false;
        let hasPadding = false;
        let hasPx = false;
        let hasPy = false;
        // Exclusion: the named `p-card` token is the sanctioned token escape.
        let excluded = false;
        for (const t of tokens) {
          if (ROUNDED.has(t)) hasRounded = true;
          if (t === "border") hasBorder = true;
          if (BG_CARD.test(t)) hasCardBg = true;
          if (P_NUM.test(t) || P_ARBITRARY.test(t)) hasPadding = true;
          if (PX.test(t)) hasPx = true;
          if (PY.test(t)) hasPy = true;
          if (t === P_CARD) excluded = true;
        }
        // `px-* AND py-*` together count as a padding token.
        if (hasPx && hasPy) hasPadding = true;

        if (excluded) return;
        if (!hasRounded || !hasBorder || !hasCardBg || !hasPadding) return;

        // No auto-fix — report once on the whole attribute.
        context.report({ node, messageId: "adhocCard" });
      },
    };
  },
});
