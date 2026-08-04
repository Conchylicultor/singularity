import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Endpoints that put user text in front of the running agent. Each is a
 * *delivery* — the transport half of a turn send — and every one of them
 * travels through the same tmux paste that can silently drop the text.
 *
 * Matching is by imported binding name, not by module path: these names are
 * unique in the repo, and a consumer necessarily imports the binding to call
 * `fetchEndpoint` / `useEndpointMutation` with it.
 */
const TURN_ENDPOINTS = new Set([
  "postConversationTurn",
  "answerAskUserQuestion",
  "startPushAndExit",
]);

/** Only web code sends turns on a user's behalf; the server IMPLEMENTS these. */
function isWebFile(filename: string): boolean {
  return filename.includes("/web/") || filename.endsWith("/web/index.ts");
}

export default createRule({
  name: "no-adhoc-turn-send",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow calling a turn-delivery endpoint directly from web code — " +
        "every send must route through sendConversationTurn so it gets the " +
        "optimistic echo, transcript confirmation, and retry.",
    },
    schema: [],
    messages: {
      adhocTurnSend:
        "'{{name}}' delivers a turn to the agent, so calling it directly from " +
        "web code silently opts this surface out of the whole send lifecycle: " +
        "no optimistic echo, no transcript confirmation, no 'turn-unconfirmed' " +
        "report when the tmux paste drops the text, and no Retry. Call " +
        "sendConversationTurn from " +
        "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web " +
        "instead — if your turn does not travel over POST /turn, register a " +
        "TurnDelivery with defineTurnDelivery and pass it as `delivery`.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isWebFile(context.filename)) return {};
    return {
      ImportSpecifier(node) {
        const name =
          node.imported.type === "Identifier" ? node.imported.name : null;
        if (name && TURN_ENDPOINTS.has(name)) {
          context.report({
            node,
            messageId: "adhocTurnSend",
            data: { name },
          });
        }
      },
    };
  },
});
