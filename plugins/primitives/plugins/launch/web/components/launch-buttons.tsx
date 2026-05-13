import { useState } from "react";
import { MdAdd, MdPlayArrow } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ConversationSchema, type Conversation } from "@plugins/tasks-core/core";
import { MODEL_REGISTRY, type ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LaunchRequest = {
  prompt?: string;
  taskId?: string;
  attemptId?: string;
  forkFromConversationId?: string;
};

export type LaunchButtonsProps = {
  getRequest?: () => LaunchRequest | Promise<LaunchRequest>;
  openAfterLaunch?: boolean;
  onLaunched?: (conversation: Conversation) => void;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "icon";
  disabled?: boolean;
  className?: string;
};

const MODELS = Object.keys(MODEL_REGISTRY) as ConversationModel[];

export function useLaunchConversation({
  getRequest,
  openAfterLaunch = true,
  onLaunched,
}: Pick<LaunchButtonsProps, "getRequest" | "openAfterLaunch" | "onLaunched">) {
  const [launching, setLaunching] = useState<ConversationModel | null>(null);
  const openPane = useOpenPane();

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
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Launch failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""})${
            detail ? `: ${detail.slice(0, 200)}` : ""
          }`,
        );
      }
      const conversation = ConversationSchema.parse(await res.json());
      onLaunched?.(conversation);
      if (openAfterLaunch) openPane(conversationPane, { convId: conversation.id }, { mode: "push" });
    } finally {
      setLaunching(null);
    }
  };

  return { launch, launching };
}

export function LaunchButtons({
  getRequest,
  openAfterLaunch = true,
  onLaunched,
  variant = "default",
  size = "default",
  disabled,
  className,
}: LaunchButtonsProps) {
  const { launch, launching } = useLaunchConversation({ getRequest, openAfterLaunch, onLaunched });

  if (size === "icon") {
    return (
      <div className={cn("flex items-center gap-0.5", className)}>
        {MODELS.map((model) => (
          <button
            key={model}
            type="button"
            onClick={(e) => launch(e, model)}
            disabled={disabled || launching !== null}
            title={`Launch ${MODEL_REGISTRY[model].label}`}
            aria-label={`Launch ${MODEL_REGISTRY[model].label}`}
            className={cn(
              "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded",
              launching === model && "opacity-50",
            )}
          >
            <MdPlayArrow className={MODEL_REGISTRY[model].iconSize} />
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
          className={cn("flex-1 gap-1", variant === "default" && "bg-[oklch(0.44_0.09_240)] hover:bg-[oklch(0.5_0.09_240)] text-white")}
          onClick={(e: React.MouseEvent) => launch(e, model)}
          disabled={disabled || launching !== null}
        >
          <MdAdd className="size-4" />
          {launching === model ? "Launching…" : MODEL_REGISTRY[model].label}
        </Button>
      ))}
    </div>
  );
}
