import { MdPlayArrow } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/shared";
import {
  useLastAssistantEvent,
  RowActionButton,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useLaunchConversation } from "@plugins/primitives/plugins/launch/web";
import { MODEL_REGISTRY, type ConversationModel } from "@plugins/conversations/plugins/model-provider/shared";

const MODELS = Object.keys(MODEL_REGISTRY) as ConversationModel[];

export function ForkSessionAction({ event }: { event: JsonlEvent }) {
  const lastAssistant = useLastAssistantEvent();
  const { conversation } = conversationPane.useData();
  const { launch, launching } = useLaunchConversation({
    getRequest: () => ({ forkFromConversationId: conversation.id }),
  });

  if (event !== lastAssistant || !conversation.claudeSessionId) return null;

  return (
    <>
      {MODELS.map((model) => (
        <RowActionButton
          key={model}
          title={`Fork session → ${model}`}
          disabled={!!launching}
          onClick={(e) => launch(e, model)}
        >
          <MdPlayArrow className={MODEL_REGISTRY[model].iconSize} />
        </RowActionButton>
      ))}
    </>
  );
}
