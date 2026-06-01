import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { answerAskUserQuestion } from "../shared/endpoints";
import { handleAnswer } from "./internal/handle-answer";

export default {
  id: "conversation-jsonl-viewer-tool-call-ask-user-question",
  name: "AskUserQuestion answer",
  httpRoutes: {
    [answerAskUserQuestion.route]: handleAnswer,
  },
} satisfies ServerPluginDefinition;
