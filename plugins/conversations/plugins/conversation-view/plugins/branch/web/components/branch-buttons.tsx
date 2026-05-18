import { useState } from "react";
import { GitBranch } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useLaunchConversation } from "@plugins/primitives/plugins/launch/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import {
  MODEL_REGISTRY,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
import { Button } from "@/components/ui/button";

const MODELS = Object.keys(MODEL_REGISTRY) as ConversationModel[];

export function BranchButtons({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const { launch, launching } = useLaunchConversation({
    openAfterLaunch: false,
    getRequest: () => ({
      forkFromConversationId: conversation.id,
      prompt,
    }),
    onLaunched: () => {
      setPrompt("");
      setOpen(false);
      Shell.Toast({ description: "Branch created", variant: "success" });
    },
  });

  if (!conversation.claudeSessionId) return null;

  const canSubmit = prompt.trim().length > 0 && !launching;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          title="Branch conversation"
          aria-label="Branch conversation"
        >
          <GitBranch className="size-3.5" />
          Branch
        </button>
      }
      tooltip="Fork this session into a background conversation"
      contentClassName="w-[480px]"
    >
      <div className="flex flex-col gap-3 p-3">
        <div className="text-sm font-medium">Branch from this conversation</div>
        <TextEditor
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => {
            if (canSubmit) void launch({} as React.MouseEvent, MODELS[0]!);
          }}
          submitMode="cmd-enter"
          placeholder="Describe the direction to explore…"
          autoFocus
          minRows={3}
          maxHeight="12rem"
          namespace="branch-prompt"
        />
        <div className="flex justify-end gap-2">
          {MODELS.map((model) => (
            <Button
              key={model}
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={!canSubmit}
              onClick={(e) => launch(e, model)}
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
