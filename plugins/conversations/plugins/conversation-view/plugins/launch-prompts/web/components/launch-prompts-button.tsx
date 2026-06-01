import { useState } from "react";
import { MdPlaylistPlay } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConfig } from "@plugins/config_v2/web";
import { toast } from "@plugins/notifications/web";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { launchPromptsConfig } from "../../shared/config";

const FAMILY_CHIP: Record<"opus" | "sonnet", string> = {
  opus: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  sonnet: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

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
        disabled={launching}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        aria-label="Launch prompts"
      >
        <MdPlaylistPlay className="size-3" />
        Launch
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {prompts.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => void launch(item)}
            className="flex items-center justify-between gap-6"
          >
            <span>{item.title}</span>
            {(() => {
              const meta = MODEL_REGISTRY[normalizeModel(item.model)];
              return (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${FAMILY_CHIP[meta.family]}`}
                >
                  {meta.label}
                </span>
              );
            })()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
