import { Button, ButtonGroup, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@plugins/primitives/plugins/ui-kit/web";
import { useState } from "react";
import { MdPlayArrow, MdExpandMore, MdCheck } from "react-icons/md";
import { useOpenPane, type PaneOpenMode } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { type Conversation } from "@plugins/tasks/plugins/tasks-core/core";
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

export type LaunchRequest = {
  prompt?: string;
  taskId?: string;
  attemptId?: string;
  forkFromConversationId?: string;
  prepromptId?: string;
};

export type LaunchControlProps = {
  getRequest?: () => LaunchRequest | Promise<LaunchRequest>;
  openAfterLaunch?: boolean;
  /**
   * How to open the freshly created conversation pane. Defaults to `"push"`
   * (append to the right of the caller). Surfaces that launch from a root
   * landing pane (e.g. the welcome view) pass `"root"` so the new
   * conversation replaces the chain instead of opening a sibling column.
   */
  openMode?: PaneOpenMode;
  onLaunched?: (conversation: Conversation) => void;
  variant?: "default" | "outline" | "ghost";
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
  openMode = "push",
  onLaunched,
}: Pick<LaunchControlProps, "getRequest" | "openAfterLaunch" | "openMode" | "onLaunched">) {
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
      if (openAfterLaunch) openPane(conversationPane, { convId: conversation.id }, { mode: openMode });
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
  openMode = "push",
  onLaunched,
  variant = "default",
  size = "default",
  disabled,
  className,
}: LaunchControlProps) {
  const { launch, launching } = useLaunchConversation({ getRequest, openAfterLaunch, openMode, onLaunched });
  const defaultModel = useDefaultModel();
  const visibleModels = useVisibleModels();
  const setDefaultModel = useSetDefaultModel();

  const busy = disabled || launching !== null;
  const btnVariant = variant;
  const blue =
    variant === "default"
      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
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
          className="justify-between gap-lg"
        >
          <span className="flex items-center gap-xs">
            {MODEL_REGISTRY[id].label}
            {id === defaultModel && <MdCheck className="size-3.5 opacity-70" />}
          </span>
          <span className="flex items-center gap-xs">
            <button
              type="button"
              aria-label={`Launch ${MODEL_REGISTRY[id].label}`}
              title={`Launch ${MODEL_REGISTRY[id].label}`}
              onClick={(e) => {
                e.stopPropagation();
                void launch(id, e);
              }}
              className="hover:bg-accent flex size-5 items-center justify-center rounded-md opacity-0 group-hover/dropdown-menu-item:opacity-100"
            >
              <MdPlayArrow className="size-3.5" />
            </button>
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- ml-0 resets the Kbd primitive's default left margin in this inline row */}
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
      <ButtonGroup className={className}>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={busy}
          aria-label={`Launch ${MODEL_REGISTRY[defaultModel].label}`}
          title={`Launch ${MODEL_REGISTRY[defaultModel].label}`}
          onClick={() => void launch(defaultModel)}
          className={cn(launching === defaultModel && "opacity-50")}
        >
          <MdPlayArrow className={MODEL_REGISTRY[defaultModel].iconSize} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label="Choose model"
                className="px-none"
              />
            }
          >
            <MdExpandMore className="size-3" />
          </DropdownMenuTrigger>
          {rows}
        </DropdownMenu>
      </ButtonGroup>
    );
  }

  const btnSize = size === "sm" ? "sm" : "default";

  return (
    <ButtonGroup className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={btnVariant}
              size={btnSize}
              disabled={disabled}
              className={cn("gap-xs", blue)}
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
          "px-sm",
          blue,
          variant === "default" && "border-l border-white/20",
        )}
      >
        <MdPlayArrow className={cn("size-4", launching === defaultModel && "opacity-50")} />
      </Button>
    </ButtonGroup>
  );
}
