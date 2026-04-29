import { useState } from "react";
import { MdAdd } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/shared";
import {
  useLastAssistantEvent,
  RowActionButton,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ConversationSchema, type ConversationModel } from "@plugins/conversations/shared";

const MODELS: ConversationModel[] = ["sonnet", "opus"];
const ICON_SIZE: Record<ConversationModel, string> = { sonnet: "size-2.5", opus: "size-3.5" };

export function ForkConversationAction({ event }: { event: JsonlEvent }) {
  const lastAssistant = useLastAssistantEvent();
  const { conversation } = conversationPane.useData();
  const [launching, setLaunching] = useState<ConversationModel | null>(null);

  if (event !== lastAssistant) return null;

  const launch = async (e: React.MouseEvent, model: ConversationModel) => {
    e.stopPropagation();
    if (launching) return;
    setLaunching(model);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, attemptId: conversation.attemptId }),
      });
      if (res.ok) {
        const conv = ConversationSchema.parse(await res.json());
        conversationPane.open({ convId: conv.id });
      }
    } finally {
      setLaunching(null);
    }
  };

  return (
    <>
      {MODELS.map((model) => (
        <RowActionButton
          key={model}
          title={`New ${model} conversation`}
          disabled={!!launching}
          onClick={(e) => launch(e, model)}
        >
          <MdAdd className={ICON_SIZE[model]} />
        </RowActionButton>
      ))}
    </>
  );
}
