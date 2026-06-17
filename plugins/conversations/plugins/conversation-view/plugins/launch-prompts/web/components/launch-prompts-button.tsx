import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { MdPlaylistPlay } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConfig } from "@plugins/config_v2/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { fetchEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { createConversation } from "@plugins/conversations/core";
import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import { launchPromptsConfig } from "../../shared/config";

export function LaunchPromptsButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { prompts } = useConfig(launchPromptsConfig);
  const [launching, setLaunching] = useState(false);

  if (prompts.length === 0) return null;

  async function launch(item: (typeof prompts)[number]) {
    if (launching) return;
    setLaunching(true);
    try {
      await fetchEndpoint(createConversation, {}, {
        body: {
          model: item.model,
          prompt: item.prompt,
          attemptId: conversation.attemptId,
        },
      });
      toast({ type: "conversation", title: "Conversation launched", description: `Launched: ${item.title}` });
    } catch (err) {
      toast({
        type: "conversation",
        title: "Failed to launch",
        description: getEndpointErrorMessage(err),
        variant: "error",
      });
    } finally {
      setLaunching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" loading={launching} aria-label="Launch prompts" />
        }
      >
        <MdPlaylistPlay className="size-3" />
        Launch
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {prompts.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => void launch(item)}
            className="flex items-center justify-between gap-xl"
          >
            <span>{item.title}</span>
            {(() => {
              const meta = MODEL_REGISTRY[normalizeModel(item.model)];
              return (
                <Badge size="md" colorClass={familyClass(meta.family)} className="shrink-0">
                  {meta.label}
                </Badge>
              );
            })()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
