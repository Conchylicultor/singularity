import { useState } from "react";
import { MdAdd, MdPlayArrow } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  ConversationSchema,
  type ConversationModel,
} from "@plugins/conversations/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LaunchRequest = {
  prompt?: string;
  taskId?: string;
};

export type LaunchButtonsProps = {
  getRequest?: () => LaunchRequest | Promise<LaunchRequest>;
  openAfterLaunch?: boolean;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "icon";
  disabled?: boolean;
  className?: string;
};

const MODELS: ConversationModel[] = ["sonnet", "opus"];
const LABEL: Record<ConversationModel, string> = { sonnet: "Sonnet", opus: "Opus" };
const ICON_SIZE: Record<ConversationModel, string> = { sonnet: "size-3", opus: "size-4" };

export function LaunchButtons({
  getRequest,
  openAfterLaunch = true,
  variant = "default",
  size = "default",
  disabled,
  className,
}: LaunchButtonsProps) {
  const [launching, setLaunching] = useState<ConversationModel | null>(null);

  const launch = async (e: React.MouseEvent, model: ConversationModel) => {
    e.stopPropagation();
    if (launching) return;
    setLaunching(model);
    try {
      const request = (await getRequest?.()) ?? {};
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, ...request }),
      });
      if (!res.ok) return;
      const conversation = ConversationSchema.parse(await res.json());
      if (openAfterLaunch) {
        Shell.OpenPane(conversationPane({ session_id: conversation.id }));
      }
    } finally {
      setLaunching(null);
    }
  };

  if (size === "icon") {
    return (
      <div className={cn("flex items-center gap-0.5", className)}>
        {MODELS.map((model) => (
          <button
            key={model}
            type="button"
            onClick={(e) => launch(e, model)}
            disabled={disabled || launching !== null}
            title={`Launch ${LABEL[model]}`}
            aria-label={`Launch ${LABEL[model]}`}
            className={cn(
              "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded",
              launching === model && "opacity-50",
            )}
          >
            <MdPlayArrow className={ICON_SIZE[model]} />
          </button>
        ))}
      </div>
    );
  }

  const buttonSize = size === "sm" ? "sm" : "default";

  return (
    <div className={cn("flex gap-2", className)}>
      {MODELS.map((model) => (
        <Button
          key={model}
          variant={variant}
          size={buttonSize}
          className="flex-1 gap-1"
          onClick={(e: React.MouseEvent) => launch(e, model)}
          disabled={disabled || launching !== null}
        >
          <MdAdd className="size-4" />
          {launching === model ? "Launching…" : LABEL[model]}
        </Button>
      ))}
    </div>
  );
}
