import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESTree,
} from "@typescript-eslint/utils";

/**
 * no-provider-trigger-render
 *
 * `render` is base-ui's composition seam: the host component
 * `cloneElement`s the element you hand it with its own merged props (`ref`,
 * handlers, aria wiring, `data-*` state). Every one of those lands on that
 * element's ROOT — so if the root is a context-provider component that renders
 * NO DOM node (`ControlSizeProvider`, `SingleLineProvider`,
 * `PortalForwardProvider`, `PortalThemeScopeProvider`, …), the whole merged bag
 * is silently dropped. No error, no warning.
 *
 * It bites on both sides of the seam:
 *
 *  - a `*Trigger` — the button renders but its menu/popover never opens (a live
 *    bug once: the data-view view-switcher "+" add-view dropdown, fixed by
 *    hoisting the provider OUTSIDE the trigger over a DOM-rooted `IconButton`);
 *  - a `*Popup` — the panel renders but loses its positioning ref, dismiss
 *    handlers and `data-open`/`data-side` state. `OverlayPanel` (the one panel
 *    behind every floating surface) is composed exactly this way, which is why
 *    "a real host element at the root, spreading `{...rest}`" is its stated
 *    invariant rather than a convention.
 *
 * So the rule flags a `*Provider` root under ANY `render` prop (plus the known
 * render-forwarding wrappers like `InlinePopover`'s `trigger`) — the failure is
 * a property of `render` itself, not of what sits on the other end of it.
 * Detection is purely structural (AST + name-based), like the sibling rules — no
 * type services. The check is ROOT-ONLY: cloneElement merges only onto the
 * render element's root, so a provider nested deeper is harmless and is NOT
 * flagged.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** Stringify a JSX opening-element name (handles member / namespaced forms). */
function stringifyJSXName(name: TSESTree.JSXTagNameExpression): string {
  switch (name.type) {
    case AST_NODE_TYPES.JSXIdentifier:
      return name.name;
    case AST_NODE_TYPES.JSXMemberExpression:
      return `${stringifyJSXName(name.object)}.${name.property.name}`;
    case AST_NODE_TYPES.JSXNamespacedName:
      return `${name.namespace.name}:${name.name.name}`;
    default: {
      const _exhaustive: never = name;
      return String(_exhaustive);
    }
  }
}

/** Final identifier of a possibly-compound JSX name (`Menu.Trigger` → `Trigger`). */
function lastSegment(name: string): string {
  const dot = name.split(".").pop() ?? name;
  return dot.split(":").pop() ?? dot;
}

/**
 * Known render-forwarding wrappers that splice their `<prop>` value's root onto
 * the underlying trigger — keyed by the element's stringified name, valued by the
 * forwarding prop name. Extend this as new wrappers appear.
 */
const RENDER_FORWARDING_WRAPPERS: Record<string, string> = {
  InlinePopover: "trigger",
};

/**
 * Collect the candidate ROOT JSX elements from a render-slot expression. Only the
 * root of each rendered branch matters (base-ui merges onto the root), so we
 * descend through conditionals/logical operators but never into an element's
 * children.
 */
function collectRootElements(
  node: TSESTree.Expression,
): TSESTree.JSXElement[] {
  if (node.type === "JSXElement") return [node];
  if (node.type === "ConditionalExpression") {
    return [
      ...collectRootElements(node.consequent),
      ...collectRootElements(node.alternate),
    ];
  }
  if (node.type === "LogicalExpression") {
    const roots = collectRootElements(node.right);
    if (node.left.type === "JSXElement") roots.push(node.left);
    return roots;
  }
  return [];
}

export default createRule({
  name: "no-provider-trigger-render",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a context-provider component (renders no DOM node) as the root " +
        "of a base-ui `render` prop — the merged props (ref, handlers, aria and " +
        "data-* state) are silently dropped, so a trigger never opens and a popup " +
        "loses its positioning and dismiss wiring. Hoist the provider OUTSIDE the " +
        "render element and use a DOM-rooted element (e.g. IconButton, " +
        "OverlayPanel) as the render target.",
    },
    schema: [],
    messages: {
      providerAsTriggerRender:
        "`{{provider}}` is a context provider that renders no DOM node, so " +
        "`{{trigger}}` silently drops the props it merges onto its `render` root " +
        "(ref, handlers, aria and data-* state) — a trigger renders but never " +
        "opens; a popup renders unpositioned and undismissable. Hoist the " +
        "provider OUTSIDE the render element and give `render` a DOM-rooted one " +
        "(e.g. IconButton, OverlayPanel).",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node: TSESTree.JSXAttribute) {
        if (node.name.type !== "JSXIdentifier") return;
        const attrName = node.name.name;

        const parent = node.parent;
        if (parent.type !== "JSXOpeningElement") return;
        const elementName = stringifyJSXName(parent.name);

        // (a) ANY `render` prop — the drop is a property of the composition
        //     seam itself, not of the host on the other end of it, OR
        // (b) a known render-forwarding wrapper's forwarding prop.
        const isRender = attrName === "render";
        const isForwardingWrapper =
          RENDER_FORWARDING_WRAPPERS[elementName] === attrName;
        if (!isRender && !isForwardingWrapper) return;

        const value = node.value;
        if (!value || value.type !== "JSXExpressionContainer") return;
        const expr = value.expression;
        if (expr.type === "JSXEmptyExpression") return;

        for (const root of collectRootElements(expr)) {
          const provider = stringifyJSXName(root.openingElement.name);
          if (lastSegment(provider).endsWith("Provider")) {
            context.report({
              node: root,
              messageId: "providerAsTriggerRender",
              data: { provider, trigger: elementName },
            });
          }
        }
      },
    };
  },
});
