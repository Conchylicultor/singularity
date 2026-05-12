import { useState } from "react";
import { ListVideo } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { launchPromptsResource } from "../../internal/resources";
import type { LaunchPrompt } from "../../internal/resources";

const MODEL_LABEL: Record<"sonnet" | "opus", string> = {
  sonnet: "Sonnet",
  opus: "Opus",
};

const MODEL_CLASS: Record<"sonnet" | "opus", string> = {
  sonnet: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  opus:   "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

export function LaunchPromptsButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { data: prompts } = useResource(launchPromptsResource);
  const [launching, setLaunching] = useState(false);

  if (prompts.length === 0) return null;

  async function launch(item: LaunchPrompt) {
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
      Shell.Toast({ description: `Launched: ${item.title}` });
    } catch (err) {
      Shell.Toast({
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
        <ListVideo className="size-3" />
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
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${MODEL_CLASS[item.model]}`}
            >
              {MODEL_LABEL[item.model]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
