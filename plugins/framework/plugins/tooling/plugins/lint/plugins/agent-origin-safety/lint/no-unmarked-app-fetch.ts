import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Is this a NODE-SIDE fetch to the app under test?
 *
 * The distinction that matters is absolute vs relative, and it is not a
 * stylistic one — it is exactly the line between marked and unmarked:
 *
 *   `fetch("/api/pages/…")`        inside `page.evaluate` — runs IN THE BROWSER,
 *                                  so the context's agent-origin headers already
 *                                  apply. Nothing to fix; flagging it would be
 *                                  wrong, and there is no `agentFetch` in the
 *                                  page to migrate it to.
 *   `fetch(`${base}/api/…`)`       runs in Node. Unmarked. This is the hole.
 *   `fetch(pathUrl("/api/…"))`     runs in Node. Unmarked. Same hole.
 *
 * A relative URL cannot be resolved by Node at all, so an absolute one is a
 * reliable signal of which side the call is on — no need to reason about
 * whether an enclosing callee is `evaluate`.
 *
 * Deliberately narrow beyond that: a `fetch` to a third-party service from an
 * e2e script is legitimate and carries no provenance question. Only the app
 * under test does, and `/api/` (or `pathUrl`) is what names it.
 */
function isUnmarkedNodeAppFetch(
  arg: TSESTree.CallExpressionArgument | undefined,
): boolean {
  if (!arg) return false;

  // `pathUrl(...)` builds an absolute URL against the run's target.
  if (
    arg.type === "CallExpression" &&
    arg.callee.type === "Identifier" &&
    arg.callee.name === "pathUrl"
  ) {
    return true;
  }

  if (arg.type === "TemplateLiteral") {
    const first = arg.quasis[0]?.value.raw ?? "";
    // Starts with a literal path segment → relative → browser-side. Starts with
    // an interpolation (`${base}…`) → absolute → Node-side.
    if (first.startsWith("/")) return false;
    return arg.quasis.some((q) => q.value.raw.includes("/api/"));
  }

  // A plain string can only be relative here (an absolute one would hardcode a
  // host, which `paths:no-hardcoded-paths` and the harness's own target
  // derivation already rule out), so it is browser-side.
  return false;
}

export default createRule({
  name: "no-unmarked-app-fetch",
  meta: {
    type: "problem",
    docs: {
      description:
        "In e2e scripts, call the app under test through `agentFetch` rather than a bare `fetch`, so the request carries agent-origin provenance.",
    },
    schema: [],
    messages: {
      unmarked:
        "A bare `fetch` to the app under test carries no agent-origin header, so " +
        "everything it writes is invisible to the machinery that cleans up after a " +
        "run: a page it creates is never swept, and a config document it writes is " +
        "not recorded in the revert ledger and stays changed in the user's config " +
        "after the script exits. The script still goes green. `withBrowser` marks " +
        "the browser CONTEXT, which cannot cover a request the script makes from " +
        "Node — that is this gap. Use `agentFetch(path, init?)` from " +
        "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e, which applies " +
        "the headers and resolves `path` against the same `--base` target.",
    },
  },
  defaultOptions: [],
  create(context) {
    // Scoped to e2e by filename rather than by config, because the rule is
    // `enforceEverywhere` (contributed rules are otherwise off in e2e files) and
    // the claim is specific to e2e: a `fetch` to `/api/` from server code is an
    // ordinary internal call with no provenance question, and web code is
    // already covered by `endpoints:typed-web-fetches`.
    if (!context.filename.includes("/e2e/")) return {};

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        if (node.callee.name !== "fetch") return;
        if (!isUnmarkedNodeAppFetch(node.arguments[0])) return;
        context.report({ node, messageId: "unmarked" });
      },
    };
  },
});
