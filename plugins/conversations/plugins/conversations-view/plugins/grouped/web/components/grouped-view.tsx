import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, useState } from "react";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import { useConversations } from "@plugins/conversations/web";
import { InfiniteScrollFooter } from "@plugins/primitives/plugins/cursor-pagination/web";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import { useGoneConversationsPagination } from "@plugins/conversations/plugins/conversations-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { GroupedConversationList } from "./grouped-conversation-list";

const SHOW_SYSTEM_KEY = "conversations-view:show-system";

export function GroupedView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const conv = useConversations();
  const active = useMemo(() => (conv.pending ? [] : conv.active), [conv]);
  const recentGone = useMemo(() => (conv.pending ? [] : conv.recentGone), [conv]);
  const hasMoreGone = conv.pending ? false : conv.hasMoreGone;
  const system = conv.pending ? [] : conv.system;

  const [showSystem, setShowSystem] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_SYSTEM_KEY) === "1";
    } catch (err) {
      if (!(err instanceof DOMException)) throw err;
      return false;
    }
  });
  const toggleShowSystem = () => {
    setShowSystem((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_SYSTEM_KEY, next ? "1" : "0");
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
      return next;
    });
  };

  const liveIds = useMemo(
    () => new Set([...active, ...recentGone].map((c) => c.id)),
    [active, recentGone],
  );

  const pagination = useGoneConversationsPagination({
    recentGone,
    hasMoreGone,
    liveIds,
  });
  const paginatedItems = pagination.items;

  const isEmpty = active.length === 0 && recentGone.length === 0;

  return (
    <Stack gap="xs">
      <Stack gap="none" direction="row" align="center" justify="end" className="px-sm pb-xs">
        <button
          type="button"
          onClick={toggleShowSystem}
          title={
            showSystem ? "Hide system conversations" : "Show system conversations"
          }
          aria-pressed={showSystem}
          className={cn(
            "rounded-md hover:bg-accent",
            showSystem ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          <Center className="size-7">
            {showSystem ? (
              <MdVisibility className="size-4" />
            ) : (
              <MdVisibilityOff className="size-4" />
            )}
          </Center>
        </button>
      </Stack>
      <GroupedConversationList
        active={active}
        system={system}
        showSystem={showSystem}
        recentGone={recentGone}
        paginatedItems={paginatedItems}
        activeId={activeId}
        onNavigate={onNavigate}
        onCloseConversation={onCloseConversation}
      />
      <InfiniteScrollFooter handle={pagination} />
      {isEmpty && !conv.pending && (
        <Text as="div" variant="caption" className="px-lg py-sm text-muted-foreground">
          No conversations
        </Text>
      )}
    </Stack>
  );
}
