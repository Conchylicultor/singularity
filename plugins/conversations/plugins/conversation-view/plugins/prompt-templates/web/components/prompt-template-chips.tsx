import { PenLine } from "lucide-react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Button } from "@/components/ui/button";
import { promptTemplatesResource } from "../../shared/resources";

export function PromptTemplateChips({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { data: templates } = useResource(promptTemplatesResource);
  const [, setDraft] = useDraft("conversation:prompt", "", {
    scope: conversation.id,
  });

  if (templates.length === 0) return null;

  const disabled =
    live.status === "gone" ||
    live.status === "done" ||
    live.status === "starting";

  if (disabled) return null;

  function insertTemplate(prompt: string) {
    setDraft((prev) => prompt + (prev ? "\n" + prev : ""));
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {templates.map((t) => (
        <Button
          key={t.id}
          variant="outline"
          size="sm"
          className="h-7 rounded-full border-dashed px-3 text-xs"
          onClick={() => insertTemplate(t.prompt)}
        >
          <PenLine className="mr-1 size-3" />
          {t.title}
        </Button>
      ))}
    </div>
  );
}
