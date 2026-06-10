import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

/**
 * no-raw-web-fetch
 *
 * Web code must talk to the server through the typed-endpoint client
 * (`fetchEndpoint` / `useEndpoint` / `useEndpointMutation` from
 * `@plugins/infra/plugins/endpoints/web`), never a raw `fetch(...)` or a
 * `fetchWithRetry(...)` wrapper. A raw web fetch evades the typed contract (no
 * shared route string, no request/response validation, no error reporting).
 *
 * Detection is NAME-based (like reactive-server-io): we flag a CallExpression
 * whose callee identifier is `fetch` or `fetchWithRetry`. No import resolution —
 * intentionally evadable by indirection, which is accepted. The rule only fires
 * inside files whose path contains `/web/`; primitives and burndown holdouts are
 * exempted via the contributing plugin's `ignores` globs (see lint/index.ts).
 */

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/** Callee names that constitute a raw web fetch. */
const RAW_FETCH_NAMES = new Set(["fetch", "fetchWithRetry"]);

/** Extract the simple callee name of a call, member-or-identifier. */
function calleeName(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return null;
}

export default createRule({
  name: "no-raw-web-fetch",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw fetch()/fetchWithRetry() in web code — use " +
        "fetchEndpoint/useEndpoint from the endpoints primitive instead.",
    },
    schema: [],
    messages: {
      noRawWebFetch:
        "Raw {{name}}() in web code bypasses the typed-endpoint contract. Use " +
        "fetchEndpoint / useEndpoint / useEndpointMutation from " +
        "@plugins/infra/plugins/endpoints/web instead. See the endpoints " +
        "plugin CLAUDE.md.",
    },
  },
  defaultOptions: [],
  create(context) {
    // Only web code is in scope; non-web files never match.
    if (!context.filename.includes("/web/")) return {};
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const name = calleeName(node);
        if (!name || !RAW_FETCH_NAMES.has(name)) return;
        context.report({ node, messageId: "noRawWebFetch", data: { name } });
      },
    };
  },
});
