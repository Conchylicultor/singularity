import { useEffect } from "react";
import { MdAutoAwesome, MdPushPin, MdOutlinePushPin } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useConfig } from "@plugins/config_v2/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import {
  getFocusedPlacement,
  setFocusedTabPlacement,
  useFocusedPlacement,
} from "@plugins/apps/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { actionBarConfig } from "../../shared/config";
import {
  useActionBarStatus,
  type ActionBarStatus,
  type StatusTone,
} from "../internal/use-action-bar-status";

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

// Effectively permanent: the pin is a deliberate UI preference, not a transient
// draft, so it must outlive the persistent-draft primitive's default 7-day TTL.
const PIN_TTL = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * The always-visible collapsed glyph: an icon plus a status dot aggregating the
 * "needs attention" signals (WS connectivity, stale tab, unread notifications).
 */
function StatusGlyph({ status }: { status: ActionBarStatus }) {
  return (
    <WithTooltip content={status.pending ? "Loading…" : status.tooltip}>
      <div className="pointer-events-auto relative flex size-8 shrink-0 items-center justify-center">
        <MdAutoAwesome className="size-4 text-muted-foreground" />
        <StatusDot
          colorClass={`${TONE_CLASS[status.pending ? "ok" : status.tone]}${!status.pending && status.pulse ? " animate-pulse" : ""}`}
          size="sm"
          className="absolute -top-0.5 -right-0.5 ring-2 ring-background"
        />
      </div>
    </WithTooltip>
  );
}

/** The shared action set plus the pin toggle — the expanding portion of the bar. */
function ActionRow({
  pinned,
  onTogglePin,
}: {
  pinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <>
      <ActionBar.Item.Render />
      <IconButton
        icon={pinned ? MdPushPin : MdOutlinePushPin}
        label={pinned ? "Unpin action bar" : "Pin action bar"}
        size="icon-sm"
        onClick={onTogglePin}
      />
    </>
  );
}

/**
 * Shared pin-toggle hook backing both hosts: the pin is the single persisted
 * preference (synced across the floating + docked mounts via persistent-draft).
 * Turning the pin **on** while the focused tab is solo (fullscreen) snaps it
 * back to docked, since the pinned strip lives in the tab bar and must be
 * visible — "pinned ⇒ never solo".
 */
function useActionBarPin() {
  const [pinned, setPinned] = useDraft<boolean>("action-bar-pinned", false, {
    ttl: PIN_TTL,
  });
  const togglePin = () => {
    const next = !pinned;
    if (next && getFocusedPlacement() === "solo") {
      setFocusedTabPlacement("docked");
    }
    setPinned(next);
  };
  return { pinned, togglePin };
}

/**
 * Floating overlay host (mounted at `Core.Root`, outside any transformed
 * ancestor). Renders only when **unpinned**: a top-right `z-popover` overlay
 * collapsed to the status glyph that hover-expands the action row leftward.
 * Mounting in the body stacking context above the solo portal's `z-overlay`
 * keeps it visible in every placement mode, including solo (the headline fix).
 */
export function FloatingActionBarHost() {
  const { enabled } = useConfig(actionBarConfig);
  const { pinned, togglePin } = useActionBarPin();
  const status = useActionBarStatus();

  if (!enabled || pinned) return null;

  return (
    <FloatingAction
      className="fixed top-2 right-3 z-popover"
      anchor="top-right"
      variant="ghost"
      panelClassName="items-center"
    >
      <StatusGlyph status={status} />
      <FloatingActionFadeIn className="flex max-w-0 items-center gap-sm overflow-hidden whitespace-nowrap pr-sm transition-[max-width] duration-200 group-data-open/fa:max-w-[80rem]">
        <ActionRow pinned={false} onTogglePin={togglePin} />
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}

/**
 * Docked strip host (mounted at `Apps.TabBarActions`, the tab bar's trailing
 * zone). Renders only when **pinned**: a right-aligned, non-compressing strip
 * the tab strip scrolls under. A guard effect enforces "pinned ⇒ never solo" —
 * if the focused tab is moved to solo from the placement control while pinned,
 * it snaps back to docked so the strip stays visible.
 */
export function DockedActionBarHost() {
  const { enabled } = useConfig(actionBarConfig);
  const { pinned, togglePin } = useActionBarPin();
  const status = useActionBarStatus();
  const placement = useFocusedPlacement();

  useEffect(() => {
    if (pinned && placement === "solo") setFocusedTabPlacement("docked");
  }, [pinned, placement]);

  if (!enabled || !pinned) return null;

  return (
    <div className="flex shrink-0 items-center gap-sm pl-sm">
      <StatusGlyph status={status} />
      <ActionRow pinned onTogglePin={togglePin} />
    </div>
  );
}
