import {
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { MdFullscreen, MdOpenInNew, MdTab, MdWebAsset } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSection,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { fillClasses } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { embedUrl } from "@plugins/primitives/plugins/embed/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import {
  FrameSource,
  usePrototypeDetail,
  type CanvasFrame,
  type FrameActionRow,
  type FrameResolution,
  type PrototypeFrame,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { presentPath } from "../panes";
import { PresentOverlay, type PresentPlacement } from "./present-overlay";

/**
 * "Present" — one frame's menu of the ways to see it without the app around
 * it, ordered by how much they cover: this app tab (with a new-app-tab icon),
 * this browser tab (with a new-browser-tab icon), and full screen (`F`).
 *
 * A frame action (`PrototypeFrameActions`) on each canvas frame, so this whole
 * feature is one folder the canvas knows nothing about. The menu of the
 * SELECTED frame also owns the `F` key, so `F` presents the selected frame.
 */
export function PresentMenu({ row }: ItemActionProps<FrameActionRow>) {
  const { frame, meta } = row;
  const { canvas, dispatch } = usePrototypeDetail();
  const [placement, setPlacement] = useState<PresentPlacement | null>(null);
  // Stable: the overlay's fullscreen effect keys on this callback, and a fresh
  // identity each render would re-run it (exit + re-request every render).
  const close = useCallback(() => setPlacement(null), []);
  // Presenting selects the frame, as clicking it would — so while this frame
  // is on show, this menu is the one holding `F` (and it stands down, below).
  const present = useEventCallback((where: PresentPlacement) => {
    dispatch({ type: "select", id: frame.id });
    setPlacement(where);
  });

  const holdsF = canvas.selected === frame.id && placement === null;
  const fullScreenKey = useMemo(
    () =>
      holdsF
        ? [
            {
              id: "prototypes.present-full-screen",
              keys: "f",
              label: "Present the selected frame in full screen",
              group: "Prototypes",
              handler: () => present("screen"),
            },
          ]
        : [],
    [holdsF, present],
  );
  useSurfaceShortcuts(fullScreenKey);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              aspect="icon"
              aria-label="Present"
              title="Present"
            />
          }
        >
          <MdFullscreen />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSection label="Present">
            <PresentRow
              icon={MdTab}
              label="In this app tab"
              hint="The tab bar stays, so you can switch tabs."
              onClick={() => present("surface")}
              newTab={
                <NewTabItem
                  label="Open in a new app tab"
                  open={
                    frame.kind === "prototype"
                      ? () =>
                          navigate(presentPath(frameTarget(frame, meta)), {
                            newTab: true,
                          })
                      : undefined
                  }
                />
              }
            />
            <PresentRow
              icon={MdWebAsset}
              label="In this browser tab"
              hint="Nothing but the frame."
              onClick={() => present("viewport")}
              newTab={<NewBrowserTabItem frame={frame} meta={meta} />}
            />
            <PresentRow
              icon={MdFullscreen}
              label="Full screen"
              shortcut="F"
              onClick={() => present("screen")}
            />
          </DropdownMenuSection>
        </DropdownMenuContent>
      </DropdownMenu>
      {placement !== null && (
        // Keyed by placement: changing destination remounts the stage rather
        // than swapping one overlay's portal container under it, which React
        // would reconcile into a half-move (and reload the iframe anyway).
        <PresentOverlay
          key={placement}
          name={meta.name}
          frameId={frame.id}
          placement={placement}
          onClose={close}
        />
      )}
    </>
  );
}

/** What a prototype frame's page shows: its version, and its own picks (not A's). */
function frameTarget(frame: PrototypeFrame, meta: PrototypeMeta) {
  return {
    name: meta.name,
    sha: frame.version?.sha,
    // Frame A reads the shared record, and so will the page; any other frame
    // carries its own variant along.
    picks: frame.picks === "shared" ? undefined : frame.picks,
  };
}

/**
 * One destination: icon, label and the muted line saying what it covers, with
 * an optional trailing "open it in a new tab" item beside it.
 */
function PresentRow({
  icon: Icon,
  label,
  hint,
  shortcut,
  onClick,
  newTab,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  shortcut?: string;
  onClick: () => void;
  newTab?: ReactNode;
}) {
  return (
    <Stack direction="row" gap="2xs" align="center">
      <DropdownMenuItem onClick={onClick} className={fillClasses("x")}>
        <Icon className="size-4 text-muted-foreground" />
        <Stack gap="none" className={fillClasses("x")}>
          <Text>{label}</Text>
          {hint !== undefined ? (
            <Text variant="caption" tone="muted">
              {hint}
            </Text>
          ) : null}
        </Stack>
        {shortcut !== undefined ? <Kbd>{shortcut}</Kbd> : null}
      </DropdownMenuItem>
      {newTab}
    </Stack>
  );
}

/** The trailing new-tab icon: disabled when there is nothing to open. */
function NewTabItem({
  label,
  open,
}: {
  label: string;
  open: (() => void) | undefined;
}) {
  return (
    <DropdownMenuItem
      aria-label={label}
      title={
        open === undefined ? `${label} — not available for this frame` : label
      }
      disabled={open === undefined}
      onClick={open}
      className="w-auto"
    >
      <MdOpenInNew className="size-4" />
    </DropdownMenuItem>
  );
}

/**
 * A new browser tab: a prototype frame opens the app's own present page,
 * chromeless (`?embed=1`) — the same stage, options pill included; a source
 * frame opens what it shows on its own (its `href`), when it has one.
 */
function NewBrowserTabItem({
  frame,
  meta,
}: {
  frame: CanvasFrame;
  meta: PrototypeMeta;
}) {
  const label = "Open in a new browser tab";
  const openHref = (href: string) => () =>
    window.open(href, "_blank", "noopener,noreferrer");
  if (frame.kind === "prototype") {
    return (
      <NewTabItem
        label={label}
        open={openHref(
          embedUrl(presentPath(frameTarget(frame, meta)), "chromeless"),
        )}
      />
    );
  }
  return (
    <FrameSource.Dispatch source={frame.source} meta={meta}>
      {(resolution: FrameResolution) => (
        <NewTabItem
          label={label}
          open={
            resolution.status === "found" && resolution.href !== undefined
              ? openHref(resolution.href)
              : undefined
          }
        />
      )}
    </FrameSource.Dispatch>
  );
}
