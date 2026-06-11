/**
 * Bans the `result.pending ? <emptyDefault> : result.data` idiom on resource
 * results. That ternary collapses "still loading" and "genuinely empty" into
 * the same value at the exact line where the distinction still exists — the
 * root of the wrong-state-while-loading bug class (empty states, zero counts,
 * and destructive default button modes flashing during the load window).
 *
 * Flags a ConditionalExpression when ALL of:
 *   - the test is `X.pending` (or `!X.pending`, branches swapped),
 *   - X is a binding initialized from useResource / useOptimisticResource /
 *     combineResources / useCombinedResources,
 *   - the pending branch is an empty default ([], {}, null, false, 0, "",
 *     undefined, or a const initialized to one of those),
 *   - the settled branch references `X.data`.
 *
 * Carve-out (favor false negatives): `useResource(…, { select })` results are
 * sanctioned point reads where `pending ? null : q.data` is legitimate.
 *
 * Sanctioned replacements: early-return on `.pending`, <ResourceView>/
 * matchResource(...), combineResources(...) for multi-resource views, or
 * DataView's `loading` prop. See plugins/primitives/plugins/live-state/CLAUDE.md.
 */
import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import type { TSESLint } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

const RESOURCE_HOOKS = new Set([
  "useResource",
  "useOptimisticResource",
  "combineResources",
  "useCombinedResources",
]);

type Ctx = Readonly<TSESLint.RuleContext<"pendingCollapse", []>>;

function resolveVariable(
  context: Ctx,
  ident: TSESTree.Identifier,
): TSESLint.Scope.Variable | null {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(ident);
  while (scope) {
    const v = scope.variables.find((v) => v.name === ident.name);
    if (v) return v;
    scope = scope.upper;
  }
  return null;
}

function initializerOf(
  context: Ctx,
  ident: TSESTree.Identifier,
): TSESTree.Expression | null {
  const def = resolveVariable(context, ident)?.defs[0];
  if (!def || def.node.type !== AST_NODE_TYPES.VariableDeclarator) return null;
  return def.node.init ?? null;
}

/** Strip `x as T` / `<T>x` / parenthesized wrappers. */
function unwrap(node: TSESTree.Node): TSESTree.Node {
  let n = node;
  while (
    n.type === AST_NODE_TYPES.TSAsExpression ||
    n.type === AST_NODE_TYPES.TSTypeAssertion ||
    n.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    n = n.expression;
  }
  return n;
}

function isEmptyDefaultLiteral(node: TSESTree.Node): boolean {
  const n = unwrap(node);
  if (n.type === AST_NODE_TYPES.ArrayExpression) return n.elements.length === 0;
  if (n.type === AST_NODE_TYPES.ObjectExpression) return n.properties.length === 0;
  if (n.type === AST_NODE_TYPES.Literal) {
    return n.value === null || n.value === false || n.value === 0 || n.value === "";
  }
  if (n.type === AST_NODE_TYPES.Identifier) return n.name === "undefined";
  return false;
}

function isEmptyDefault(context: Ctx, node: TSESTree.Node): boolean {
  const n = unwrap(node);
  if (isEmptyDefaultLiteral(n)) return true;
  // Hoisted `const EMPTY = []` style defaults — resolve one level.
  if (n.type === AST_NODE_TYPES.Identifier) {
    const init = initializerOf(context, n);
    return init !== null && isEmptyDefaultLiteral(init);
  }
  return false;
}

function isAstNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/** Does the branch reference `<objName>.data` anywhere in its subtree? */
function referencesData(node: TSESTree.Node, objName: string): boolean {
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === objName &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === "data"
  ) {
    return true;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (isAstNode(c) && referencesData(c, objName)) return true;
      }
    } else if (isAstNode(child) && referencesData(child, objName)) {
      return true;
    }
  }
  return false;
}

function isResourceResultBinding(context: Ctx, ident: TSESTree.Identifier): boolean {
  const init = initializerOf(context, ident);
  if (!init) return false;
  const call = unwrap(init);
  if (call.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = call.callee;
  const name =
    callee.type === AST_NODE_TYPES.Identifier
      ? callee.name
      : callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.property.type === AST_NODE_TYPES.Identifier
        ? callee.property.name
        : null;
  if (!name || !RESOURCE_HOOKS.has(name)) return false;
  // Carve-out: select-based point reads are sanctioned narrowed reads.
  if (name === "useResource") {
    const opts = call.arguments[2];
    if (
      opts &&
      unwrap(opts).type === AST_NODE_TYPES.ObjectExpression &&
      (unwrap(opts) as TSESTree.ObjectExpression).properties.some(
        (p) =>
          p.type === AST_NODE_TYPES.Property &&
          !p.computed &&
          ((p.key.type === AST_NODE_TYPES.Identifier && p.key.name === "select") ||
            (p.key.type === AST_NODE_TYPES.Literal && p.key.value === "select")),
      )
    ) {
      return false;
    }
  }
  return true;
}

/** Returns the result identifier when `expr` is `<ident>.pending`. */
function pendingAccessOf(expr: TSESTree.Node): TSESTree.Identifier | null {
  const n = unwrap(expr);
  if (
    n.type === AST_NODE_TYPES.MemberExpression &&
    !n.computed &&
    n.object.type === AST_NODE_TYPES.Identifier &&
    n.property.type === AST_NODE_TYPES.Identifier &&
    n.property.name === "pending"
  ) {
    return n.object;
  }
  return null;
}

export default createRule({
  name: "no-pending-data-collapse",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `result.pending ? <emptyDefault> : result.data` on resource results — it collapses loading into a fake empty state.",
    },
    schema: [],
    messages: {
      pendingCollapse:
        "`{{name}}.pending ? <default> : {{name}}.data` collapses loading into a fake empty/default state — downstream code can no " +
        "longer tell \"still loading\" from \"genuinely empty\" (the wrong-state-while-loading bug class). Gate instead: early-return on " +
        "`.pending`, wrap in <ResourceView>/matchResource(…), combine multiple resources with combineResources(…), or pass `loading` to " +
        "DataView. See plugins/primitives/plugins/live-state/CLAUDE.md.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ConditionalExpression(node) {
        let obj = pendingAccessOf(node.test);
        let pendingBranch: TSESTree.Node;
        let dataBranch: TSESTree.Node;
        if (obj) {
          pendingBranch = node.consequent;
          dataBranch = node.alternate;
        } else {
          const t = unwrap(node.test);
          if (t.type !== AST_NODE_TYPES.UnaryExpression || t.operator !== "!") return;
          obj = pendingAccessOf(t.argument);
          if (!obj) return;
          pendingBranch = node.alternate;
          dataBranch = node.consequent;
        }
        if (!isEmptyDefault(context, pendingBranch)) return;
        if (!referencesData(dataBranch, obj.name)) return;
        if (!isResourceResultBinding(context, obj)) return;
        context.report({ node, messageId: "pendingCollapse", data: { name: obj.name } });
      },
    };
  },
});
