/**
 * Bans a click handler whose whole job is `openPane(...)`.
 *
 * A control that opens a pane is a LINK: ⌘/Ctrl-click and middle-click must open
 * its destination in a new browser tab, as they would on an `<a href>`. A bare
 * `onClick` cannot do that — a middle-click fires `onAuxClick`, never `onClick`,
 * and the click handler throws the modifiers away — so the control silently
 * loses the gesture. The fix is the open's link form, same arguments:
 *
 * ```tsx
 * <Button onClick={() => openPane(tracePane, { id }, { mode: "push" })} />  // ✗
 * <Button {...openPane.link(tracePane, { id }, { mode: "push" })} />        // ✓
 * ```
 *
 * and, for an `AppShell` sidebar entry, its `opens: { pane, params }` arm.
 *
 * A DataView row is the same control: `onRowActivate={(r) => openPane(…)}` (or a
 * `rowActivation` resolver handing back `() => openPane(…)`) makes a row whose
 * middle-click does nothing. Its fix is the open's DATA form, returned from the
 * resolver, which the views wire to every gesture:
 *
 * ```tsx
 * <DataView onRowActivate={(r) => openPane(p, { id: r.id }, { mode: "push" })} />  // ✗
 * <DataView rowActivation={(r) => openPane.to(p, { id: r.id }, { mode: "push" })} /> // ✓
 * ```
 *
 * Fires on a JSX `onClick={…}` attribute, and an object property `onClick: …`
 * (a contribution's data), whose value is a function whose body IS a call to
 * `openPane` / `<x>.openPane`, or whose block's SOLE statement is one. A handler
 * doing other work besides (toggling an inline opener, stopping propagation and
 * then deciding) is not "only an open", so it is left to the author. Imperative
 * opens outside click handlers (`onSelect`, after a mutation) are untouched.
 *
 * Not type-aware: matched by the callee's NAME, which is the convention every
 * opener binding follows (`const openPane = useOpenPane()`).
 */
import {
  AST_NODE_TYPES,
  ESLintUtils,
  type TSESTree,
} from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

function isOpenPaneCall(node: TSESTree.Node | null | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier)
    return callee.name === "openPane";
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === "openPane"
  );
}

/** A function whose body is, or whose block's sole statement is, an open. */
function onlyOpensPane(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.type !== AST_NODE_TYPES.FunctionExpression
  )
    return false;
  const body = node.body;
  if (body.type !== AST_NODE_TYPES.BlockStatement) return isOpenPaneCall(body);
  if (body.body.length !== 1) return false;
  const only = body.body[0]!;
  if (only.type === AST_NODE_TYPES.ExpressionStatement)
    return isOpenPaneCall(only.expression);
  if (only.type === AST_NODE_TYPES.ReturnStatement)
    return isOpenPaneCall(only.argument);
  return false;
}

/** A resolver `(row) => () => openPane(…)` — a row activation that only opens. */
function resolvesToOnlyOpen(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression ||
    node.body.type === AST_NODE_TYPES.BlockStatement
  )
    return false;
  return onlyOpensPane(node.body);
}

export default createRule({
  name: "no-onclick-open-pane",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban an onClick whose only job is openPane(...) — spread openPane.link(...) so ⌘/middle-click open a browser tab.",
    },
    messages: {
      onClickOpenPane:
        "This click handler only opens a pane, so the control is a link — but a bare onClick drops ⌘/Ctrl- and middle-click. " +
        "Spread `{...openPane.link(target, params, opts)}` (same arguments) instead, or use `opens: { pane, params }` for a sidebar entry.",
      rowActivateOpenPane:
        "This row activation only opens a pane, so the row is a link — but a bare callback drops ⌘/Ctrl- and middle-click. " +
        "Return the open's data form instead: `rowActivation={(row) => openPane.to(target, params, opts)}` (same arguments).",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
        const value = node.value;
        if (value?.type !== AST_NODE_TYPES.JSXExpressionContainer) return;
        const expr = value.expression;
        switch (node.name.name) {
          case "onClick":
            if (onlyOpensPane(expr))
              context.report({ node, messageId: "onClickOpenPane" });
            return;
          case "onRowActivate":
            if (onlyOpensPane(expr))
              context.report({ node, messageId: "rowActivateOpenPane" });
            return;
          case "rowActivation":
            if (resolvesToOnlyOpen(expr))
              context.report({ node, messageId: "rowActivateOpenPane" });
            return;
        }
      },
      Property(node) {
        const key = node.key;
        const named =
          (key.type === AST_NODE_TYPES.Identifier && key.name === "onClick") ||
          (key.type === AST_NODE_TYPES.Literal && key.value === "onClick");
        if (!named || node.computed) return;
        if (onlyOpensPane(node.value))
          context.report({ node, messageId: "onClickOpenPane" });
      },
    };
  },
});
