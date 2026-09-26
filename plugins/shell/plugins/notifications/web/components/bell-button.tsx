import { useEffect, useRef, useState } from "react";
import { MdNotifications, MdNotificationsNone } from "react-icons/md";
import { useLive } from "@plugins/network/plugins/live/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { recentClientIds } from "../internal/toast";
import { notifications, notificationsUnread } from "../../shared/resources";
import { markAllNotificationsRead } from "../../shared/endpoints";
import { NotificationsPanel } from "./notifications-panel";

export function BellButton() {
  const [open, setOpen] = useState(false);
  // The default window (newest 200 undismissed) — boot-preloaded, so the bell
  // paints settled. It drives the toasts and the panel's `empty`; the popover
  // body reads its own queries and mounts only while open.
  const notificationsResult = useLive(notifications);
  // The badge counts the WHOLE collection (a server-side count), not the loaded
  // window — an unread error older than the newest 200 still turns it red.
  const unreadResult = useLive(notificationsUnread);

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
        if (
          !prevIdsRef.current.has(n.id) &&
          !recentClientIds.has(n.id) &&
          !n.muted
        ) {
          showToast({
            title: n.title,
            description: n.description,
            variant: n.variant,
          });
        }
      }
    }
    prevIdsRef.current = currentIds;
    // notificationsResult identity changes on every push; depend on the result object
  }, [notificationsResult]);

  const hadUnreadRef = useRef(false);

  // Gate at the render boundary — prevents the badge from flashing 0→N while
  // either read loads (both are boot-preloaded, so this is normally never hit).
  // Render a neutral bell (no badge) during the load window.
  if (unreadResult.pending || notificationsResult.pending) {
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
  const { errors, warnings } = unreadResult.data;
  const unreadCount = errors + warnings;
  // Match the badge color to the most severe unread item: red only when a crash
  // (error) is present, otherwise orange for warning-only noise (e.g. slow ops).
  const badgeColor =
    errors > 0
      ? "bg-destructive text-destructive-foreground"
      : "bg-warning text-warning-foreground";

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
            // The exact count: the visible badge caps at "9+".
            label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            className={unreadCount > 0 ? undefined : "text-muted-foreground"}
          />
          {unreadCount > 0 && (
            <Pin
              to="top-right"
              outset
              decorative
              style={{ top: "-0.125rem", right: "-0.125rem" }}
            >
              <Center
                className={`size-4 rounded-full ${badgeColor} text-3xs font-bold tabular-nums`}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Center>
            </Pin>
          )}
        </span>
      }
      align="end"
      width="xl"
      padding="none"
    >
      {open && (
        <NotificationsPanel
          empty={list.length === 0}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </InlinePopover>
  );
}
