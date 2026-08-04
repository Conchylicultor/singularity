import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { defineTurnDelivery } from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { startPushAndExit } from "../../shared/endpoints";

/**
 * Push & Close delivers a turn like any other — the wrap-up prompt goes into
 * the same CLI input box, through the same tmux paste, and can be lost the same
 * way. It just travels over its own endpoint, because the server reads the
 * prompt text from config rather than trusting the client's copy.
 *
 * The record's echoed `text` is that same config prompt read client-side, so
 * transcript matching (and therefore the confirmation deadline and the
 * `turn-unconfirmed` report) works exactly as it does for a typed turn. There
 * is no payload: the endpoint takes only the conversation id.
 */
export const pushAndExitDelivery = defineTurnDelivery<null>({
  id: "push-and-exit",
  async send(conversationId, _payload, signal) {
    await fetchEndpoint(startPushAndExit, { id: conversationId }, { signal });
    // The server sends the config prompt verbatim; the record's own text is
    // already the match target.
    return { resolvedText: null };
  },
});
