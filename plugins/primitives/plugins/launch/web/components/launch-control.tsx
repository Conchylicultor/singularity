import { useState } from "react";
import { MdPlayArrow, MdExpandMore, MdCheck } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { type Conversation } from "@plugins/tasks-core/core";
import { createConversation } from "@plugins/conversations/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  MODEL_REGISTRY,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
import {
  useVisibleModels,
  useDefaultModel,
  useSetDefaultModel,
} from "@plugins/conversations/plugins/model-provider/web";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LaunchRequest = {
  prompt?: string;
  taskId?: string;
  attemptId?: string;
  forkFromConversationId?: string;
};

export type LaunchControlProps = {
  getRequest?: () => LaunchRequest | Promise<LaunchRequest>;
  openAfterLaunch?: boolean;
  onLaunched?: (conversation: Conversation) => void;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "icon";
  disabled?: boolean;
  className?: string;
};

/**
 * The launch action, generalized over any concrete model. `launch(model, e?)`
 * creates a conversation pinned to that model. This is the common action the
 * launch plugin exposes; custom UIs (fork-session, branch) consume it directly.
 */
export function useLaunchConversation({
  getRequest,
  openAfterLaunch = true,
  onLaunched,
}: Pick<LaunchControlProps, "getRequest" | "openAfterLaunch" | "onLaunched">) {
  const [launching, setLaunching] = useState<ConversationModel | null>(null);
  const openPane = useOpenPane();

  const launch = async (model: ConversationModel, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (launching) return;
    setLaunching(model);
    try {
      const request = (await getRequest?.()) ?? {};
      const conversation = await fetchEndpoint(createConversation, {}, { body: { model, ...request } });
      onLaunched?.(conversation);
      if (openAfterLaunch) openPane(conversationPane, { convId: conversation.id }, { mode: "push" });
    } finally {
      setLaunching(null);
    }
  };

  return { launch, launching };
}

/**
 * Split [ <model dropdown> | <launch> ] control. The dropdown lists the visible
 * concrete models; clicking a row sets it as the persisted default; the hover
 * launch icon on each row fires that model one-time; the main launch button
 * fires the current default.
 */
export function LaunchControl({
  getRequest,
  openAfterLaunch = true,
  onLaunched,
  variant = "default",
  size = "default",
  disabled,
  className,
}: LaunchControlProps) {
  const { launch, launching } = useLaunchConversation({ getRequest, openAfterLaunch, onLaunched });
  const defaultModel = useDefaultModel();
  const visibleModels = useVisibleModels();
  const setDefaultModel = useSetDefaultModel();

  const busy = disabled || launching !== null;
  const btnVariant = variant === "default" ? "default" : "outline";
  const blue =
    variant === "default"
      ? "bg-[oklch(0.44_0.09_240)] hover:bg-[oklch(0.5_0.09_240)] text-white"
      : "";

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > visibleModels.length) return;
    e.preventDefault();
    void launch(visibleModels[n - 1]!);
  };

  const rows = (
    <DropdownMenuContent
      align="start"
      className="w-auto min-w-[15rem]"
      onKeyDown={onMenuKeyDown}
    >
      {visibleModels.map((id, i) => (
        <DropdownMenuItem
          key={id}
          onClick={() => setDefaultModel(id)}
          className="justify-between gap-4"
        >
          <span className="flex items-center gap-1.5">
            {MODEL_REGISTRY[id].label}
            {id === defaultModel && <MdCheck className="size-3.5 opacity-70" />}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Launch ${MODEL_REGISTRY[id].label}`}
              title={`Launch ${MODEL_REGISTRY[id].label}`}
              onClick={(e) => {
                e.stopPropagation();
                void launch(id, e);
              }}
              className="hover:bg-accent flex size-5 items-center justify-center rounded opacity-0 group-hover/dropdown-menu-item:opacity-100"
            >
              <MdPlayArrow className="size-3.5" />
            </button>
            <Kbd className="ml-0 text-muted-foreground border-border bg-muted">
              {formatShortcutLabel(`mod+${i + 1}`)}
            </Kbd>
          </span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );

  if (size === "icon") {
    return (
      <div className={cn("flex items-center", className)}>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={`Launch ${MODEL_REGISTRY[defaultModel].label}`}
          title={`Launch ${MODEL_REGISTRY[defaultModel].label}`}
          onClick={() => void launch(defaultModel)}
          className={cn("size-6 rounded-r-none", launching === defaultModel && "opacity-50")}
        >
          <MdPlayArrow className={MODEL_REGISTRY[defaultModel].iconSize} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label="Choose model"
                className="size-6 rounded-l-none px-0"
              />
            }
          >
            <MdExpandMore className="size-3" />
          </DropdownMenuTrigger>
          {rows}
        </DropdownMenu>
      </div>
    );
  }

  const btnSize = size === "sm" ? "sm" : "default";

  return (
    <div className={cn("flex items-center", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={btnVariant}
              size={btnSize}
              disabled={disabled}
              className={cn("gap-1 rounded-r-none", blue)}
            />
          }
        >
          {MODEL_REGISTRY[defaultModel].label}
          <MdExpandMore className="size-4 opacity-80" />
        </DropdownMenuTrigger>
        {rows}
      </DropdownMenu>
      <Button
        variant={btnVariant}
        size={btnSize}
        disabled={busy}
        aria-label={`Launch ${MODEL_REGISTRY[defaultModel].label}`}
        title={`Launch ${MODEL_REGISTRY[defaultModel].label}`}
        onClick={() => void launch(defaultModel)}
        className={cn(
          "rounded-l-none px-2.5",
          blue,
          variant === "default" && "border-l border-white/20",
        )}
      >
        <MdPlayArrow className={cn("size-4", launching === defaultModel && "opacity-50")} />
      </Button>
    </div>
  );
}
