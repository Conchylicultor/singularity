import { useEffect, useRef, useState } from "react";
import { MdNotifications, MdNotificationsNone } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { ShellCommands } from "@plugins/shell/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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

function navigateTo(url: string) {
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

function NotificationRow({ n, dismiss, navigateTo: nav, onClose }: { n: Notification; dismiss: (id: string) => void; navigateTo: (url: string) => void; onClose: () => void }) {
  const clientId = typeof n.metadata?.clientId === "string" ? n.metadata.clientId : null;
  return (
    <li
      className={`flex gap-2 px-3 py-2.5 border-l-2 ${n.muted ? VARIANT_BORDER_MUTED[n.variant] : VARIANT_BORDER[n.variant]} ${n.muted || n.read ? "opacity-60" : ""} hover:bg-muted/50 ${n.linkTo?.startsWith("/") ? "cursor-pointer" : ""}`}
      onClick={
        n.linkTo?.startsWith("/")
          ? () => { nav(n.linkTo!); onClose(); }
          : undefined
      }
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {n.muted && (
            <Badge
              size="sm"
              variant="muted"
              className="shrink-0"
              title="Low-signal / expected — dimmed, kept out of the unread badge, and never toasted."
            >
              muted
            </Badge>
          )}
          <Text as="p" variant="label" className={`truncate ${n.muted ? VARIANT_TEXT_MUTED[n.variant] : VARIANT_TEXT[n.variant]}`}>
            {n.title}
          </Text>
        </div>
        {n.description && n.description !== n.title && (
          <Text as="p" variant="caption" className="text-muted-foreground line-clamp-2">
            {n.description}
          </Text>
        )}
        <div className="flex items-center gap-2 mt-0.5">
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
        </div>
      </div>
      <Text
        as="button"
        variant="body"
        // eslint-disable-next-line text/no-adhoc-typography -- tight line-height centers the × glyph in the button
        className="shrink-0 text-muted-foreground hover:text-foreground leading-none"
        onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
        aria-label="Dismiss"
      >
        &times;
      </Text>
    </li>
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
      <span className="relative inline-flex">
        <IconButton
          icon={MdNotificationsNone}
          label="Notifications"
          className="text-muted-foreground"
        />
      </span>
    );
  }

  const list = notificationsResult.data;
  const unreadCount = list.filter(
    (n) => !n.read && !n.muted && (n.variant === "error" || n.variant === "warning"),
  ).length;

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
        <span className="relative inline-flex">
          <IconButton
            icon={unreadCount > 0 ? MdNotifications : MdNotificationsNone}
            label="Notifications"
            className={unreadCount > 0 ? undefined : "text-muted-foreground"}
          />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center size-4 rounded-full bg-destructive text-destructive-foreground text-3xs font-bold tabular-nums pointer-events-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
      }
      align="end"
      contentClassName="w-80 p-0"
    >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <Text variant="body" className="font-semibold">Notifications</Text>
          {list.length > 0 && (
            <Text
              as="button"
              variant="caption"
              className="text-muted-foreground hover:text-foreground"
              onClick={dismissAll}
            >
              Clear all
            </Text>
          )}
        </div>
        {list.length > 0 && (
          <div className="flex gap-1 px-3 py-1.5 overflow-x-auto border-b">
            {(["all", ...(hasErrors ? ["errors"] : []), ...uniqueTypes] as string[]).map((chip) => (
              <ToggleChip
                key={chip}
                variant="ghost"
                size="sm"
                active={typeFilter === chip}
                onClick={() => { setTypeFilter(chip); }}
                className="shrink-0"
              >
                {chip === "all" ? "All" : chip.charAt(0).toUpperCase() + chip.slice(1)}
              </ToggleChip>
            ))}
          </div>
        )}
        {list.length === 0 ? (
          <Text as="p" variant="body" className="px-3 py-6 text-center text-muted-foreground">
            No notifications
          </Text>
        ) : filtered.length === 0 ? (
          <Text as="p" variant="body" className="px-3 py-6 text-center text-muted-foreground">
            No notifications for this filter
          </Text>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {unreadFiltered.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-3xs font-semibold uppercase tracking-wider text-destructive bg-destructive/5 border-b">
                  Unread ({unreadFiltered.length})
                </div>
                <ul>
                  {unreadFiltered.map((n) => (
                    <NotificationRow key={n.id} n={n} dismiss={dismiss} navigateTo={navigateTo} onClose={() => { setOpen(false); }} />
                  ))}
                </ul>
              </>
            )}
            {restFiltered.length > 0 && (
              <>
                {unreadFiltered.length > 0 && (
                  <div className="px-3 py-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-t">
                    Earlier
                  </div>
                )}
                <ul>
                  {restFiltered.map((n) => (
                    <NotificationRow key={n.id} n={n} dismiss={dismiss} navigateTo={navigateTo} onClose={() => { setOpen(false); }} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
    </InlinePopover>
  );
}
