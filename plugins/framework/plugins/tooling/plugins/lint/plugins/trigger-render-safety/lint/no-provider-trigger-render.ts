import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESTree,
} from "@typescript-eslint/utils";

/**
 * no-provider-trigger-render
 *
 * A base-ui `*Trigger` component (`DropdownMenuTrigger`, `PopoverTrigger`,
 * `Menu.Trigger`, `Select.Trigger`, …) merges its trigger wiring
 * (`aria-haspopup`, `aria-expanded`, `onClick`, `ref`) onto the ROOT element of
 * its `render` prop. If that root is a context-provider component that renders
 * NO DOM node (e.g. `ControlSizeProvider`, `SingleLineProvider`,
 * `PortalForwardProvider`, `PortalThemeScopeProvider`), the props are silently
 * dropped — the button renders but its menu/popover never opens. No error, no
 * warning.
 *
 * This already shipped one live bug (the data-view view-switcher "+" add-view
 * dropdown), fixed by hoisting the provider OUTSIDE the trigger and using a
 * DOM-rooted `IconButton` as the render target.
 *
 * This rule flags any `render` slot of a `*Trigger` (or a known render-forwarding
 * wrapper like `InlinePopover`'s `trigger`) whose ROOT JSX element is named
 * `*Provider`. Detection is purely structural (AST + name-based), like the
 * sibling rules — no type services. The check is ROOT-ONLY: base-ui merges only
 * onto the render element's root, so a provider nested deeper is harmless and is
 * NOT flagged.
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
        "of a base-ui *Trigger render prop — the trigger wiring (aria-haspopup, " +
        "onClick, ref) is silently dropped and the control never opens. Hoist the " +
        "provider to wrap the Trigger and use a DOM-rooted element (e.g. " +
        "IconButton) as the render target.",
    },
    schema: [],
    messages: {
      providerAsTriggerRender:
        "`{{provider}}` is a context provider that renders no DOM node, so the " +
        "base-ui `{{trigger}}` silently drops its trigger wiring (aria-haspopup, " +
        "onClick, ref) onto it — the control renders but never opens. Hoist the " +
        "provider to wrap the Trigger (or its DropdownMenu/Popover/Tooltip " +
        "ancestor) and use a DOM-rooted element (e.g. IconButton) as the render " +
        "target.",
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

        // (a) `render` on a `*Trigger`, OR
        // (b) a known render-forwarding wrapper's forwarding prop.
        const isTriggerRender =
          attrName === "render" && lastSegment(elementName).endsWith("Trigger");
        const isForwardingWrapper =
          RENDER_FORWARDING_WRAPPERS[elementName] === attrName;
        if (!isTriggerRender && !isForwardingWrapper) return;

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
