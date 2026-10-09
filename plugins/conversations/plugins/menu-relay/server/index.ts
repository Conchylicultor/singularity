import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { answerTerminalMenu } from "../core/endpoints";
import { handleAnswerMenu } from "./internal/handlers";

export default {
  description:
    "Answers a conversation's open terminal menu from the web: the answer endpoint, which re-reads the menu, refuses one that changed, and drives the terminal to the chosen option.",
  httpRoutes: {
    [answerTerminalMenu.route]: handleAnswerMenu,
  },
} satisfies ServerPluginDefinition;
