import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Pane-title typography guardrail.
 *
 * `PaneChrome` owns the pane-title typography: it wraps the `title` region —
 * string OR node — in the canonical `<Text variant="label">` baseline, so any
 * text inside a title node inherits the right size by CSS inheritance (see
 * `pane-chrome.tsx`). A title node therefore must NOT set its own typography
 * size; doing so re-declares (when `label`) or overrides (any other variant)
 * the container baseline and reintroduces the per-pane title drift the
 * container-enforced baseline exists to close.
 *
 * Raw `text-*`/`leading-*` inside a title is already banned everywhere by
 * `text/no-adhoc-typography`. This rule closes the remaining gap: the
 * *sanctioned* typography escape — `<Text variant>` — misused INSIDE a title.
 *
 * SCOPE — deliberately conservative; ZERO false positives is the priority.
 * Mirrors `icon-auto/no-adhoc-slot-icon-size`. Fires ONLY when ALL hold:
 *
 *   1. The attribute name is `title`.
 *   2. The element owning the attribute is `PaneChrome` (matched by opening-
 *      element identifier name; an aliased import is an accepted false negative).
 *   3. The attribute value is a `JSXExpressionContainer` wrapping inline JSX
 *      (`<PaneChrome title={<…>}>`). An identifier (`title={title}`) is skipped
 *      — we never trace a variable, an accepted false negative.
 *   4. The inline JSX subtree contains a `<Text>` element (matched by opening-
 *      element identifier name) carrying a `variant` prop.
 *
 * Each offending `<Text>` is reported on its own opening element. Report-only,
 * no autofix: dropping the `<Text variant>` (inherit the baseline) vs. keeping a
 * deliberate, eslint-disabled override is a human call.
 */

/** Recursively collect `<Text variant=…>` opening elements under `node`. */
function collectTextVariants(
  node: TSESTree.Node | null | undefined,
  out: TSESTree.JSXOpeningElement[],
): void {
  if (!node) return;
  if (node.type === "JSXOpeningElement") {
    if (node.name.type === "JSXIdentifier" && node.name.name === "Text") {
      const hasVariant = node.attributes.some(
        (a) =>
          a.type === "JSXAttribute" &&
          a.name.type === "JSXIdentifier" &&
          a.name.name === "variant",
      );
      if (hasVariant) out.push(node);
    }
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          collectTextVariants(child as TSESTree.Node, out);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      collectTextVariants(value as TSESTree.Node, out);
    }
  }
}

export default createRule({
  name: "no-adhoc-pane-title",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow <Text variant> inside a PaneChrome title= node — PaneChrome owns the pane-title typography baseline; a title node must inherit it, not set its own size.",
    },
    schema: [],
    messages: {
      adhocPaneTitle:
        "<Text variant> inside a PaneChrome `title=` node overrides the pane-title " +
        "typography baseline that PaneChrome provides. Remove it and let the title " +
        "node inherit the canonical size; set a different size only as a deliberate " +
        "override via `// eslint-disable-next-line pane/no-adhoc-pane-title -- reason`.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        // 1. Slot gate: `title=`.
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "title") return;

        // 2. Owner allow-list: the element owning this attribute must be
        // `PaneChrome`. The attribute's parent is the JSXOpeningElement.
        const ownerTag = node.parent.name;
        if (ownerTag.type !== "JSXIdentifier" || ownerTag.name !== "PaneChrome") return;

        // 3. Only inline JSX: `title={<…>}`. Skip identifiers/calls — no tracing.
        if (node.value?.type !== "JSXExpressionContainer") return;
        const expr = node.value.expression;
        if (expr.type !== "JSXElement" && expr.type !== "JSXFragment") return;

        // 4. Flag every `<Text variant>` in the inline title subtree.
        const offenders: TSESTree.JSXOpeningElement[] = [];
        collectTextVariants(expr, offenders);
        for (const el of offenders) {
          context.report({ node: el, messageId: "adhocPaneTitle" });
        }
      },
    };
  },
});
