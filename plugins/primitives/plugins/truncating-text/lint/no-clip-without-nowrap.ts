import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * The "overflow-hidden trap" guardrail.
 *
 * A horizontal flex row that carries `overflow-hidden` but NOT `whitespace-nowrap`
 * (nor `truncate`, which implies nowrap) is single-line chrome that LOOKS defended
 * but isn't: `overflow-hidden` clips text that has ALREADY wrapped to a second line —
 * it does not stop the wrap. So a toolbar / header / chip row silently grows a second
 * line and the clip hides the overflow, not the wrap. This is exactly the bug the
 * region primitives (pane-toolbar, app-shell toolbar, PaneChrome) each had.
 *
 * The fix is `whitespace-nowrap` on the row so children never wrap in the first place
 * (truncation then stays the job of the flexible leaf via `truncate` / `TruncatingText`),
 * and `overflow-hidden` clips the single line if it still doesn't fit.
 *
 * Fingerprint (a *co-occurrence* that may live across several `cn()` fragments, so we
 * aggregate every class token of one `className` into one Set first):
 *   - a flex DISPLAY (`flex` / `inline-flex`)
 *   - a clip (`overflow-hidden` / `overflow-clip`, x-axis variants included)
 *   - NO `whitespace-nowrap` and NO `truncate`
 * Excluded (the wrap is intended, or it's a 2D region — not a single-line text row):
 *   - `flex-col` / `flex-col-reverse` (vertical — wrapping isn't the failure mode)
 *   - `flex-wrap` / `flex-wrap-reverse` (author explicitly opted into multi-line)
 *   - a vertical-sizing signal (`h-full` / `h-screen` / `min-h-0`) — a row that fills
 *     its own height is a 2D layout region clipping panels, not a text bar
 *   - cross-axis start/end/stretch alignment (`items-start` / `items-end` /
 *     `items-stretch`) — a single-line text row centers its children (`items-center`);
 *     non-center alignment means multi-height children, i.e. a 2D block
 * Forcing `whitespace-nowrap` on those would wrongly freeze descendant text wrapping.
 *
 * Fires only on intrinsic host tags (lowercase) — a `<Stack>` / `<Card>` component owns
 * its own internals. No auto-fix: whether the right answer is nowrap on the row, a
 * `truncate` leaf, or an intended `flex-col`/`flex-wrap` is a per-site judgement.
 */

// Flex display tokens — the row that can wrap.
const FLEX_DISPLAY = new Set(["flex", "inline-flex"]);
// Clip tokens — `overflow-hidden`/`overflow-clip` and their x-axis variants.
const CLIP = new Set([
  "overflow-hidden",
  "overflow-clip",
  "overflow-x-hidden",
  "overflow-x-clip",
]);
// Single-line guarantees that make the row safe.
const NOWRAP = new Set(["whitespace-nowrap", "truncate"]);
// Wrap-intended / 2D-region escapes — vertical stack, explicit multi-line wrap,
// a self-sizing-height layout region, or cross-axis non-center alignment (all of
// which mean "not a single-line text row", so nowrap would be wrong).
const WRAP_OK = new Set([
  "flex-col",
  "flex-col-reverse",
  "flex-wrap",
  "flex-wrap-reverse",
  "h-full",
  "h-screen",
  "min-h-0",
  "items-start",
  "items-end",
  "items-stretch",
]);

/**
 * Recursively collect class tokens from a `className` attribute value subtree.
 * We harvest only string `Literal` `.value`s and `TemplateElement.value.raw`s —
 * never identifiers from dynamic expressions — and split each on whitespace into
 * the shared token Set. The walk is structural (visit every child node) so it is
 * robust to however the class string is assembled (bare string, template literal,
 * `cn(...)`/`clsx(...)`, ternaries, and arbitrary nesting).
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
 * Strip Tailwind variant prefixes (`hover:`, `md:`, `dark:`, …) so the utility
 * underneath is tested on its own (e.g. `md:overflow-hidden` -> `overflow-hidden`).
 */
function baseClass(token: string): string {
  const idx = token.lastIndexOf(":");
  return idx === -1 ? token : token.slice(idx + 1);
}

export default createRule({
  name: "no-clip-without-nowrap",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a horizontal flex row with overflow-hidden but no whitespace-nowrap/truncate — overflow-hidden clips already-wrapped text, it does not prevent the wrap. Add whitespace-nowrap (single-line chrome) or flex-col/flex-wrap (intended multi-line).",
    },
    schema: [],
    messages: {
      clipWithoutNowrap:
        "Single-line trap: this flex row has `overflow-hidden` but no `whitespace-nowrap` " +
        "(nor `truncate`). `overflow-hidden` clips text that has ALREADY wrapped — it does not " +
        "stop the wrap, so the row silently grows a second line. Add `whitespace-nowrap` so " +
        "children never wrap (let a `truncate`/`TruncatingText` leaf ellipsize). If multi-line " +
        "is intended, use `flex-col`/`flex-wrap`, or " +
        "`// eslint-disable-next-line truncating-text/no-clip-without-nowrap -- <reason>`.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        // Only `className` attributes.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

        // Host-tag gate: fire only on intrinsic elements (lowercase tag). A
        // capitalized component (`<Stack>`, `<Card>`) owns its own internals.
        const tag = node.parent.name;
        if (tag.type !== "JSXIdentifier") return;
        const first = tag.name[0];
        if (!first || first !== first.toLowerCase()) return;

        // Aggregate every (variant-stripped) class token into one Set.
        const tokens = new Set<string>();
        const raw = new Set<string>();
        collectTokens(node.value, raw);
        for (const t of raw) tokens.add(baseClass(t));

        let hasFlex = false;
        let hasClip = false;
        let safe = false;
        for (const t of tokens) {
          if (FLEX_DISPLAY.has(t)) hasFlex = true;
          if (CLIP.has(t)) hasClip = true;
          if (NOWRAP.has(t) || WRAP_OK.has(t)) safe = true;
        }

        if (hasFlex && hasClip && !safe) {
          context.report({ node, messageId: "clipWithoutNowrap" });
        }
      },
    };
  },
});
