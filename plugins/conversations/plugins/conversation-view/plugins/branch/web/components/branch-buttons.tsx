import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useState } from "react";
import { MdCallSplit } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useLaunchConversation } from "@plugins/primitives/plugins/launch/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import {
  MODEL_REGISTRY,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
import {
  useVisibleModels,
  useDefaultModel,
} from "@plugins/conversations/plugins/model-provider/web";

export function BranchButtons({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const defaultModel = useDefaultModel();
  const visibleModels = useVisibleModels();

  const { launch, launching } = useLaunchConversation({
    openAfterLaunch: false,
    getRequest: () => ({
      forkFromConversationId: conversation.id,
      prompt,
    }),
    onLaunched: () => {
      setPrompt("");
      setOpen(false);
      toast({ type: "conversation", title: "Branch created", description: "Forked session running in the background", variant: "success" });
    },
  });

  if (!conversation.claudeSessionId) return null;

  const canSubmit = prompt.trim().length > 0 && !launching;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          title="Branch conversation"
          aria-label="Branch conversation"
        >
          <MdCallSplit className="size-3.5" />
          Branch
        </Button>
      }
      tooltip="Fork this session into a background conversation"
      contentClassName="w-[480px]"
    >
      <div className="flex flex-col gap-3 p-3">
        <Text as="div" variant="label">Branch from this conversation</Text>
        <TextEditor
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => {
            if (canSubmit) void launch(defaultModel);
          }}
          submitMode="cmd-enter"
          placeholder="Describe the direction to explore…"
          autoFocus
          minRows={3}
          maxHeight="12rem"
          namespace="branch-prompt"
        />
        <div className="flex justify-end gap-2">
          {visibleModels.map((model: ConversationModel) => (
            <Button
              key={model}
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={!canSubmit}
              onClick={(e) => void launch(model, e)}
            >
              {launching === model
                ? "Branching…"
                : `Branch → ${MODEL_REGISTRY[model].label}`}
            </Button>
          ))}
        </div>
      </div>
    </InlinePopover>
  );
}
