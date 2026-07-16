import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

// Wrappers that self-attribute their body to a span (or deliberately opt out of
// the profiler). A `void <call>` to one of these is fine — the cost lands on a
// named span (`runTracked` / `recordEntrySpan`: a `bg`/entry span; `captureTrace`
// / `recordReport`: wrap their own DB writes in runInBackgroundLane +
// runWithoutProfiling; `enqueue`: the jobs worker opens a `job` span per run;
// `runWithoutProfiling` / `runInBackgroundLane`: observability-internal opt-outs).
const ALLOWED_ESCAPES = new Set([
  "runTracked",
  "runWithoutProfiling",
  "runInBackgroundLane",
  "recordEntrySpan",
  "captureTrace",
  "recordReport",
  "enqueue",
]);

// The subset an inline `setInterval` callback must wire in to be trusted: it must
// route its per-tick work through a span (or an explicit lane/suppression opt-out).
const INTERVAL_WRAPPERS = new Set([
  "runTracked",
  "runWithoutProfiling",
  "runInBackgroundLane",
]);

/** The callee's simple name: `foo` from `foo()`, `foo` from `obj.foo()`. */
function calleeName(call: TSESTree.CallExpression): string | undefined {
  const callee = call.callee;
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
}

/** Is `node` a `setInterval` / `globalThis.setInterval` / member `.setInterval` call? */
function isSetInterval(call: TSESTree.CallExpression): boolean {
  const callee = call.callee;
  if (callee.type === "Identifier") return callee.name === "setInterval";
  if (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name === "setInterval";
  }
  return false;
}

/**
 * Does the subtree rooted at `node` syntactically contain a CallExpression to one
 * of `names`? A shallow structural walk — an inline callback that wires a wrapper
 * in anywhere in its body is trusted; a bare-reference callback (nothing to walk)
 * is not.
 */
function containsWrapperCall(
  node: TSESTree.Node,
  names: Set<string>,
): boolean {
  let found = false;
  const visit = (n: TSESTree.Node | null | undefined): void => {
    if (found || !n || typeof n.type !== "string") return;
    if (n.type === "CallExpression") {
      const name = calleeName(n);
      if (name !== undefined && names.has(name)) {
        found = true;
        return;
      }
    }
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const value = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object") visit(child as TSESTree.Node);
        }
      } else if (value && typeof value === "object") {
        visit(value as TSESTree.Node);
      }
    }
  };
  visit(node);
  return found;
}

export default createRule({
  name: "no-untracked-detached-work",
  meta: {
    type: "problem",
    docs: {
      description:
        "Route detached main-thread work (a `void <call>` fire-and-forget, or a " +
        "`setInterval` tick) through `runTracked(label, fn)` so its cost is " +
        "attributed to a span instead of silently inflating an unrelated span's " +
        "selfMs (or vanishing at boot). Server/central only. `setTimeout` is " +
        "deliberately NOT flagged: debounce / backoff / one-shot uses dominate it, " +
        "it is rarely the invisible-long-work class, and the file-watcher substrate " +
        "already spans its timers.",
    },
    schema: [],
    messages: {
      untrackedDetachedWork:
        "Detached main-thread work must be routed through `runTracked(label, fn)` " +
        "(`@plugins/infra/plugins/runtime-profiler/core`) so its cost is attributed " +
        "to a span instead of silently inflating an unrelated span's selfMs (or " +
        "vanishing at boot). Explicit escapes: `runWithoutProfiling` / " +
        "`runInBackgroundLane` (observability-internal), or a job `enqueue`. A " +
        "sanctioned system-measuring sampler should carry an eslint-disable with a " +
        "reason.",
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = (
      context.filename ??
      context.getFilename?.() ??
      ""
    )
      .split("\\")
      .join("/");

    // Scope: this concerns main-thread server/central work only. Skip tests, and
    // client / isomorphic / separate-process trees (a different concern).
    if (filename.endsWith(".test.ts") || filename.endsWith(".spec.ts")) return {};
    if (
      filename.includes("/web/") ||
      filename.includes("/core/") ||
      filename.includes("/shared/") ||
      filename.includes("/bin/")
    ) {
      return {};
    }
    if (!filename.includes("/server/") && !filename.includes("/central/")) {
      return {};
    }

    return {
      // Trigger 1 — `void <Call>`. Only DIRECT calls (`void foo()`,
      // `void obj.foo()`, `void (async()=>{})()`) — deliberately NOT
      // `void someIdentifier` (a bare promise variable awaited/stored elsewhere).
      'UnaryExpression[operator="void"]'(node: TSESTree.UnaryExpression) {
        if (node.argument.type !== "CallExpression") return;
        const name = calleeName(node.argument);
        if (name !== undefined && ALLOWED_ESCAPES.has(name)) return;
        context.report({ node, messageId: "untrackedDetachedWork" });
      },

      // Trigger 2 — raw `setInterval`. A bare-reference callback can't be
      // inspected → flagged (forces an inline wrap or an auditable disable); an
      // inline callback that wired a wrapper in is trusted.
      CallExpression(node: TSESTree.CallExpression) {
        if (!isSetInterval(node)) return;
        const first = node.arguments[0];
        if (
          first &&
          (first.type === "ArrowFunctionExpression" ||
            first.type === "FunctionExpression") &&
          containsWrapperCall(first, INTERVAL_WRAPPERS)
        ) {
          return;
        }
        context.report({ node, messageId: "untrackedDetachedWork" });
      },
    };
  },
});
