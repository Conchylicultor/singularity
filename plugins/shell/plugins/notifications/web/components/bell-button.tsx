import { useEffect, useRef, useState } from "react";
import { MdNotifications, MdNotificationsNone } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { ShellCommands } from "@plugins/shell/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { navigate } from "@plugins/apps/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { recentClientIds } from "../internal/toast";
import { notificationsResource } from "../../shared/resources";
import { dismissNotification, dismissAllNotifications, markAllNotificationsRead } from "../../shared/endpoints";
import type { Notification } from "../../shared/schema";

const VARIANT_BORDER: Record<Notification["variant"], string> = {
  error: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-info",
  success: "border-l-success",
};

const VARIANT_TEXT: Record<Notification["variant"], string> = {
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
};

const VARIANT_BORDER_MUTED: Record<Notification["variant"], string> = {
  error: "border-l-destructive/40",
  warning: "border-l-warning/40",
  info: "border-l-info/40",
  success: "border-l-success/40",
};

const VARIANT_TEXT_MUTED: Record<Notification["variant"], string> = {
  error: "text-destructive/70",
  warning: "text-warning/70",
  info: "text-info/70",
  success: "text-success/70",
};

function NotificationRow({ n, dismiss, onClose }: { n: Notification; dismiss: (id: string) => void; onClose: () => void }) {
  const clientId = typeof n.metadata?.clientId === "string" ? n.metadata.clientId : null;
  return (
    <Frame
      as="li"
      gap="sm"
      align="start"
      className={`px-md py-sm border-l-2 ${n.muted ? VARIANT_BORDER_MUTED[n.variant] : VARIANT_BORDER[n.variant]} ${n.muted || n.read ? "opacity-60" : ""} hover:bg-muted/50 ${n.linkTo?.startsWith("/") ? "cursor-pointer" : ""}`}
      onClick={
        n.linkTo?.startsWith("/")
          ? () => { navigate(n.linkTo!); onClose(); }
          : undefined
      }
      content={
        <Stack gap="none">
          <Frame
            gap="xs"
            content={
              <Text as="p" variant="label" className={`truncate ${n.muted ? VARIANT_TEXT_MUTED[n.variant] : VARIANT_TEXT[n.variant]}`}>
                {n.title}
              </Text>
            }
            trailing={
              n.muted ? (
                <Badge
                  size="sm"
                  variant="muted"
                  title="Low-signal / expected — dimmed, kept out of the unread badge, and never toasted."
                >
                  muted
                </Badge>
              ) : undefined
            }
          />
          {n.description && n.description !== n.title && (
            <Text as="p" variant="caption" className="text-muted-foreground line-clamp-2">
              {n.description}
            </Text>
          )}
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- small top offset separating the metadata row from the description above */}
          <Stack direction="row" gap="sm" align="center" className="mt-0.5">
            <RelativeTime date={n.createdAt} className="text-3xs text-muted-foreground" />
            {n.type && (
              <span className="text-3xs text-muted-foreground">{n.type}</span>
            )}
            {clientId != null && (
              <span className="text-3xs text-muted-foreground">
                {clientId === getTabId() ? "this tab" : "another tab"}
              </span>
            )}
            {n.linkTo?.startsWith("/") && (
              <span className="text-3xs text-muted-foreground hover:text-foreground">
                View &rarr;
              </span>
            )}
          </Stack>
        </Stack>
      }
      trailing={
        <Text
          as="button"
          variant="body"
          // eslint-disable-next-line text/no-adhoc-typography -- tight line-height centers the × glyph in the button
          className="text-muted-foreground hover:text-foreground leading-none"
          onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
          aria-label="Dismiss"
        >
          &times;
        </Text>
      }
    />
  );
}

export function BellButton() {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const notificationsResult = useResource(notificationsResource);

  // prevIdsRef must always run — it tracks new-notification arrivals for toasts.
  const prevIdsRef = useRef<Set<string> | null>(null);

  // Effect: fire toasts for newly arrived notifications. Reads notificationsResult
  // directly and narrows inside so we never capture a stale pending snapshot.
  useEffect(() => {
    if (notificationsResult.pending) return;
    const settled = notificationsResult.data;
    const currentIds = new Set(settled.map((n) => n.id));
    if (prevIdsRef.current !== null) {
      for (const n of settled) {
        if (!prevIdsRef.current.has(n.id) && !recentClientIds.has(n.id) && !n.muted) {
          ShellCommands.Toast({
            title: n.title,
            description: n.description,
            variant: n.variant,
          });
        }
      }
    }
    prevIdsRef.current = currentIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- notificationsResult identity changes on every push; depend on the result object
  }, [notificationsResult]);

  const hadUnreadRef = useRef(false);

  // Gate at the render boundary — prevents the badge from flashing 0→N while
  // the resource loads. Render a neutral bell (no badge) during the load window.
  if (notificationsResult.pending) {
    return (
      <span className="relative inline-block">
        <IconButton
          icon={MdNotificationsNone}
          label="Notifications"
          className="text-muted-foreground"
        />
      </span>
    );
  }

  const list = notificationsResult.data;
  const unread = list.filter(
    (n) => !n.read && !n.muted && (n.variant === "error" || n.variant === "warning"),
  );
  const unreadCount = unread.length;
  // Match the badge color to the most severe unread item: red only when a crash
  // (error) is present, otherwise orange for warning-only noise (e.g. slow ops).
  const hasUnreadError = unread.some((n) => n.variant === "error");
  const badgeColor = hasUnreadError
    ? "bg-destructive text-destructive-foreground"
    : "bg-warning text-warning-foreground";

  const uniqueTypes = Array.from(new Set(list.map((n) => n.type))).filter(Boolean);
  const hasErrors = list.some((n) => n.variant === "error");

  const filtered = list.filter((n) =>
    typeFilter === "all"
      ? true
      : typeFilter === "errors"
        ? n.variant === "error"
        : n.type === typeFilter,
  );

  const isCountedUnread = (n: Notification) =>
    !n.read && !n.muted && (n.variant === "error" || n.variant === "warning");
  const unreadFiltered = filtered.filter(isCountedUnread);
  const restFiltered = filtered.filter((n) => !isCountedUnread(n));

  function dismiss(id: string) {
    void fetchEndpoint(dismissNotification, { id });
  }

  function dismissAll() {
    void fetchEndpoint(dismissAllNotifications, {});
  }

  function onOpenChange(next: boolean) {
    if (next) {
      hadUnreadRef.current = unreadCount > 0;
    } else if (hadUnreadRef.current) {
      void fetchEndpoint(markAllNotificationsRead, {});
      hadUnreadRef.current = false;
    }
    setOpen(next);
  }

  return (
    <InlinePopover
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <span className="relative inline-block">
          <IconButton
            icon={unreadCount > 0 ? MdNotifications : MdNotificationsNone}
            label="Notifications"
            className={unreadCount > 0 ? undefined : "text-muted-foreground"}
          />
          {unreadCount > 0 && (
            <Pin
              to="top-right"
              outset
              decorative
              style={{ top: "-0.125rem", right: "-0.125rem" }}
            >
              <Center className={`size-4 rounded-full ${badgeColor} text-3xs font-bold tabular-nums`}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Center>
            </Pin>
          )}
        </span>
      }
      align="end"
      contentClassName="w-80 p-none"
    >
        <Frame
          className="px-md py-sm border-b"
          content={<Text variant="body" className="font-semibold">Notifications</Text>}
          trailing={
            list.length > 0 ? (
              <Text
                as="button"
                variant="caption"
                className="text-muted-foreground hover:text-foreground"
                onClick={dismissAll}
              >
                Clear all
              </Text>
            ) : undefined
          }
        />
        {list.length > 0 && (
          <Scroll axis="x" className="px-md py-xs border-b">
            <Stack direction="row" gap="xs">
              {(["all", ...(hasErrors ? ["errors"] : []), ...uniqueTypes] as string[]).map((chip) => (
                <ToggleChip
                  key={chip}
                  variant="ghost"
                  size="sm"
                  active={typeFilter === chip}
                  onClick={() => { setTypeFilter(chip); }}
                  // eslint-disable-next-line layout/no-adhoc-layout -- rigid chip in the horizontally-scrolling filter row
                  className="shrink-0"
                >
                  {chip === "all" ? "All" : chip.charAt(0).toUpperCase() + chip.slice(1)}
                </ToggleChip>
              ))}
            </Stack>
          </Scroll>
        )}
        {list.length === 0 ? (
          <Text as="p" variant="body" className="px-md py-xl text-center text-muted-foreground">
            No notifications
          </Text>
        ) : filtered.length === 0 ? (
          <Text as="p" variant="body" className="px-md py-xl text-center text-muted-foreground">
            No notifications for this filter
          </Text>
        ) : (
          <Scroll className="max-h-96">
            {unreadFiltered.length > 0 && (
              <>
                <div className={`px-md py-xs text-3xs font-semibold uppercase tracking-wider border-b ${hasUnreadError ? "text-destructive bg-destructive/5" : "text-warning bg-warning/5"}`}>
                  Unread ({unreadFiltered.length})
                </div>
                <ul>
                  {unreadFiltered.map((n) => (
                    <NotificationRow key={n.id} n={n} dismiss={dismiss} onClose={() => { setOpen(false); }} />
                  ))}
                </ul>
              </>
            )}
            {restFiltered.length > 0 && (
              <>
                {unreadFiltered.length > 0 && (
                  <div className="px-md py-xs text-3xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-t">
                    Earlier
                  </div>
                )}
                <ul>
                  {restFiltered.map((n) => (
                    <NotificationRow key={n.id} n={n} dismiss={dismiss} onClose={() => { setOpen(false); }} />
                  ))}
                </ul>
              </>
            )}
          </Scroll>
        )}
    </InlinePopover>
  );
}
