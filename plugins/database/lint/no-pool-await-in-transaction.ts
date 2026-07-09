import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

/**
 * no-pool-await-in-transaction
 *
 * `db.transaction(cb)` checks out ONE pooled Postgres connection and holds it
 * for the whole life of `cb`. Every `await` inside the callback therefore
 * extends the connection lease by however long that await takes — and under
 * event-loop lag (~1s p50 at host load ~50, measured) a 3-await transaction
 * holds its connection for ~3s instead of ~10ms. That 100–500× lease inflation
 * is what saturated the 16-connection pool during the 2026-07-09 incident.
 *
 * Worse than slow: an `await` on the POOL from inside a transaction is a
 * hold-and-wait shape — the transaction pins one connection while queueing for
 * a second one. With enough concurrent transactions that is a deadlock, not a
 * slowdown.
 *
 * So: inside a transaction callback, every awaited call expression must run on
 * the transaction executor. It passes if the call is
 *   (1) a member chain rooted at the executor binding — `tx.insert(…)`,
 *       `tx.select().from(…)`, `tx.execute(sql\`…\`)`; or
 *   (2) handed the executor binding as an argument — `insertForest(tx, {…})`,
 *       `nextRankIn(_conversationGroups, tx)`, `store.run(batch, () => fn(tx))`,
 *       `emit(payload, { tx: batch.tx })`.
 *
 * A struct literal declared in the callback that carries the executor
 * (`const batch = { tx, before: new Map() }`) counts as the executor for (2),
 * so `flushStatusBatch(batch)` passes — the transaction is reachable from it.
 *
 * Anything else — `await db.select()…`, `await fetch(url)`,
 * `await listBlockingDepIds(taskId)`, an fs read, a gate acquire — is reported.
 *
 * KNOWN LIMIT — the rule cannot see one hop down. A call that merely *receives*
 * the executor (directly or via a carrier struct) satisfies condition (2) even
 * if the helper ignores it and reads off the pool internally. The real instance:
 * `await cascadeBlockedDependents(conversationId, tx)` passes here, yet the
 * helper called `listBlockingDepIds(taskId)` with no executor and hit the pool.
 * That transitive class is closed by a different mechanism — making the executor
 * a REQUIRED parameter on those query helpers, so the leak is a tsc error rather
 * than a runtime hazard (Task 5b). This rule and the required-param convention
 * are two halves of one guardrail; neither is sufficient alone.
 *
 * See research/2026-07-09-global-interactive-lane-origin-based-db-gating.md
 * (Task 5) and its forensic companion
 * research/2026-07-09-global-interactive-lane-under-load.md.
 */

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

type FunctionLike =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression;

/** `<anything>.transaction(…)` — the shape that checks out a pooled connection. */
function isTransactionCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "transaction"
  );
}

/**
 * The executor binding a transaction callback introduces, e.g. `tx` in
 * `db.transaction(async (tx) => …)`. `undefined` when the callback declares no
 * plain-identifier first param — there is then no executor to thread, so the
 * callback is unverifiable and we skip it rather than report every await.
 */
function executorBinding(call: TSESTree.CallExpression): {
  callback: FunctionLike;
  name: string;
} | undefined {
  const arg = call.arguments[0];
  if (
    arg?.type !== "ArrowFunctionExpression" &&
    arg?.type !== "FunctionExpression"
  ) {
    return undefined;
  }
  const param = arg.params[0];
  if (param?.type !== "Identifier") return undefined;
  return { callback: arg, name: param.name };
}

/** Innermost object of a member/call chain: `tx.select().from(x)` → `tx`. */
function chainRoot(node: TSESTree.Node): TSESTree.Node {
  let cur = node;
  for (;;) {
    if (cur.type === "MemberExpression") cur = cur.object;
    else if (cur.type === "CallExpression") cur = cur.callee;
    else if (cur.type === "TSNonNullExpression") cur = cur.expression;
    else return cur;
  }
}

/**
 * Does `name` appear anywhere in this argument subtree? Deliberately coarse —
 * it matches an identifier reference (`insertForest(tx, …)`), a closure capture
 * (`() => fn(tx)`), a shorthand or explicit property (`{ tx }`, `{ tx: … }`),
 * and a member property (`batch.tx`). All of them hand the executor down; the
 * rule's job is to catch calls that hand it down NOWHERE.
 */
function mentionsName(node: TSESTree.Node, name: string): boolean {
  let found = false;
  walk(node, (n) => {
    if (found) return false;
    if (n.type === "Identifier" && n.name === name) found = true;
    return !found;
  });
  return found;
}

/** Pre-order walk over every child node; `visit` returns false to prune. */
function walk(node: TSESTree.Node, visit: (n: TSESTree.Node) => boolean): void {
  if (!visit(node)) return;
  for (const key of Object.keys(node) as (keyof TSESTree.Node)[]) {
    if (key === "parent") continue;
    const value = node[key] as unknown;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) walk(child, visit);
      }
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Names from which the executor is reachable: the binding itself, plus any
 * struct literal declared in the callback that closes over it — the real shape
 * being `const batch = { tx, before: new Map() }`, later handed to
 * `flushStatusBatch(batch)`. Restricted to object/array literals on purpose: a
 * `const rows = await tx.select()` result carries DATA, not the executor, and
 * must not launder a subsequent pool call.
 */
function executorCarriers(body: TSESTree.Node, name: string): Set<string> {
  const carriers = new Set([name]);
  for (let grew = true; grew; ) {
    grew = false;
    walk(body, (n) => {
      if (n.type !== "VariableDeclarator" || n.id.type !== "Identifier") return true;
      const init = n.init;
      if (init === null || carriers.has(n.id.name)) return true;
      if (init.type !== "ObjectExpression" && init.type !== "ArrayExpression") return true;
      if ([...carriers].some((c) => mentionsName(init, c))) {
        carriers.add(n.id.name);
        grew = true;
      }
      return true;
    });
  }
  return carriers;
}

export default createRule({
  name: "no-pool-await-in-transaction",
  meta: {
    type: "problem",
    docs: {
      description:
        "no await on the pool inside a db.transaction callback " +
        "(hold-and-wait + inflated connection lease)",
    },
    schema: [],
    messages: {
      poolAwait:
        "This awaited call does not receive the transaction executor `{{tx}}`, so it runs " +
        "on the pool while the enclosing `transaction()` already holds a pooled connection — " +
        "hold-and-wait, and the connection lease inflates by this call's whole duration " +
        "(seconds under event-loop lag, not milliseconds). Run it on the transaction: call " +
        "`{{tx}}.…` directly, or pass `{{tx}}` to the helper (make its executor parameter " +
        "REQUIRED, not `= db`). If the work genuinely must not join the transaction, hoist " +
        "it above the `transaction()` call. See " +
        "research/2026-07-09-global-interactive-lane-origin-based-db-gating.md.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isTransactionCall(node)) return;
        const bound = executorBinding(node);
        if (!bound) return;
        const { callback, name } = bound;
        const carriers = executorCarriers(callback.body, name);

        walk(callback.body, (n) => {
          // A nested `transaction()` rebinds the executor and is visited as its
          // own CallExpression — its body is not ours to judge.
          if (n !== callback.body && isTransactionCall(n)) return false;

          if (n.type !== "AwaitExpression") return true;
          const call = n.argument;
          if (call.type !== "CallExpression") return true;

          const root = chainRoot(call.callee);
          const rootedAtTx = root.type === "Identifier" && carriers.has(root.name);
          const threadsTx = call.arguments.some((a) =>
            [...carriers].some((c) => mentionsName(a, c)),
          );
          if (!rootedAtTx && !threadsTx) {
            context.report({ node: call, messageId: "poolAwait", data: { tx: name } });
          }
          return true;
        });
      },
    };
  },
});
