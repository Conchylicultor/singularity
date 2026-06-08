import { useState } from "react";
import { MdPlaylistPlay } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConfig } from "@plugins/config_v2/web";
import { toast } from "@plugins/notifications/web";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: item.model,
          prompt: item.prompt,
          attemptId: conversation.attemptId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ type: "conversation", description: `Launched: ${item.title}` });
    } catch (err) {
      toast({
        type: "conversation",
        description: `Failed to launch: ${err instanceof Error ? err.message : String(err)}`,
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
          <Button variant="outline" size="sm" disabled={launching} aria-label="Launch prompts" />
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
            className="flex items-center justify-between gap-6"
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
