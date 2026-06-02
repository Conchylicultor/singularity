import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { answerAskUserQuestion, flushQuestion } from "../shared/endpoints";
import { handleAnswer } from "./internal/handle-answer";
import { handleFlush } from "./internal/handle-flush";

export default {
  id: "conversation-jsonl-viewer-tool-call-ask-user-question",
  name: "AskUserQuestion answer",
  httpRoutes: {
    [answerAskUserQuestion.route]: handleAnswer,
    [flushQuestion.route]: handleFlush,
  },
} satisfies ServerPluginDefinition;
