import { useRef, useState } from "react";
import { MdNotifications, MdNotificationsNone } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands } from "@plugins/shell/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { notificationsResource } from "../../shared/resources";
import type { Notification } from "../../shared/schema";

const VARIANT_BORDER: Record<Notification["variant"], string> = {
  error: "border-l-destructive",
  warning: "border-l-amber-500",
  info: "border-l-sky-500",
  success: "border-l-green-500",
};

const VARIANT_TEXT: Record<Notification["variant"], string> = {
  error: "text-destructive",
  warning: "text-amber-500",
  info: "text-sky-500",
  success: "text-green-500",
};

function navigateTo(url: string) {
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("shell:navigate"));
}

export function BellButton() {
  const [open, setOpen] = useState(false);
  const notificationsResult = useResource(notificationsResource);
  const list = notificationsResult.pending ? [] : notificationsResult.data;
  const unreadCount = list.filter((n) => !n.read).length;

  const prevIdsRef = useRef<Set<string> | null>(null);

  // While pending we only have an empty placeholder; skip until the first
  // real server response so we don't toast every existing row.
  if (!notificationsResult.pending) {
    const currentIds = new Set(list.map((n) => n.id));
    if (prevIdsRef.current === null) {
      prevIdsRef.current = currentIds;
    } else {
      for (const n of list) {
        if (!prevIdsRef.current.has(n.id)) {
          ShellCommands.Toast({
            title: n.title,
            description: n.description,
            variant: n.variant,
          });
        }
      }
    }
    prevIdsRef.current = currentIds;
  }

  function dismiss(id: string) {
    void fetch(`/api/notifications/${encodeURIComponent(id)}/dismiss`, {
      method: "POST",
    });
  }

  function dismissAll() {
    void fetch("/api/notifications/dismiss-all", { method: "POST" });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unreadCount > 0) {
      void fetch("/api/notifications/mark-all-read", { method: "POST" });
    }
  }

  return (
    <InlinePopover
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <button className="relative flex items-center justify-center size-8 cursor-default">
          {unreadCount > 0 ? (
            <MdNotifications className="size-5" />
          ) : (
            <MdNotificationsNone className="size-5 text-muted-foreground" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center size-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      }
      align="end"
      contentClassName="w-80 p-0"
    >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {list.length > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={dismissAll}
            >
              Clear all
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No notifications
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <ul>
              {list.map((n) => (
                <li
                  key={n.id}
                  className={`flex gap-2 px-3 py-2.5 border-l-2 ${VARIANT_BORDER[n.variant]} ${n.read ? "opacity-60" : ""} hover:bg-muted/50 ${n.linkTo?.startsWith("/") ? "cursor-pointer" : ""}`}
                  onClick={
                    n.linkTo?.startsWith("/")
                      ? () => {
                          navigateTo(n.linkTo!);
                          setOpen(false);
                        }
                      : undefined
                  }
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${VARIANT_TEXT[n.variant]}`}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {n.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RelativeTime
                        date={n.createdAt}
                        className="text-[10px] text-muted-foreground"
                      />
                      {n.linkTo?.startsWith("/") && (
                        <span className="text-[10px] text-muted-foreground hover:text-foreground">
                          View task &rarr;
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-foreground text-sm leading-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(n.id);
                    }}
                    aria-label="Dismiss"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
    </InlinePopover>
  );
}
