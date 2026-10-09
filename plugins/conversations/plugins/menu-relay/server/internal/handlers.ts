import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  answerTerminalMenu as answerMenu,
  requestStatusReconcile,
} from "@plugins/conversations/server";
import { answerTerminalMenu } from "../../core/endpoints";

export const handleAnswerMenu = implement(
  answerTerminalMenu,
  async ({ params, body }) => {
    await answerMenu(params.id, body);
    // The menu has left the screen; re-read the pane now rather than on the
    // next signal, so the card goes as soon as the answer lands.
    requestStatusReconcile([params.id]);
  },
);
