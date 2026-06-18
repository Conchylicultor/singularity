import { useMemo } from "react";
import { MdAdd, MdClose } from "react-icons/md";
import { useTabs } from "@plugins/apps/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import {
  hoverRevealClass,
  useHoverReveal,
} from "@plugins/primitives/plugins/hover-reveal/web";
import {
  createDesktop,
  removeDesktop,
  setActiveDesktop,
  topmostWindowOnDesktop,
  useDesktops,
  useFloatingWindows,
  type Desktop,
} from "../hooks/use-floating-windows";

/**
 * The virtual-desktop (workspace) pager — a compact row of numbered pills
 * composed into the LEFT of the floating dock bar (one cohesive bottom shelf, the
 * KDE / ChromeOS pattern). It honours the passive-backdrop invariant: it
 * organizes windows and lives in chrome (the dock), it is never an app launcher
 * and is never painted onto the wallpaper.
 *
 * One {@link ToggleChip} per desktop (numbered 1..N), active when it's the live
 * desktop; clicking switches to it and focuses its topmost window. A pill reveals
 * a small × on hover (only when more than one desktop exists) to remove it. A
 * trailing "+" pill creates a desktop and switches to it. State (desktop list +
 * counts) comes straight from the window store, so the pager re-renders with it.
 */
export function WorkspacePager() {
  const { desktops, activeDesktopId } = useDesktops();
  const windows = useFloatingWindows();
  const { focusTab } = useTabs();

  // Window count per desktop, for each pill's tooltip ("Desktop N · k window(s)").
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const win of windows.values())
      m.set(win.desktopId, (m.get(win.desktopId) ?? 0) + 1);
    return m;
  }, [windows]);

  const onCreate = () => {
    const id = createDesktop({ activate: true });
    // A freshly-created desktop is empty, so there is no window to focus.
    const top = topmostWindowOnDesktop(id);
    if (top) focusTab(top.activeTabId);
  };

  return (
    <Cluster gap="2xs">
      {desktops.map((desktop, index) => (
        <DesktopPill
          key={desktop.id}
          desktop={desktop}
          index={index}
          active={desktop.id === activeDesktopId}
          windowCount={counts.get(desktop.id) ?? 0}
          removable={desktops.length > 1}
          onSwitch={() => {
            setActiveDesktop(desktop.id);
            const top = topmostWindowOnDesktop(desktop.id);
            if (top) focusTab(top.activeTabId);
          }}
        />
      ))}
      <IconButton
        icon={MdAdd}
        label="New desktop"
        size="icon-sm"
        onClick={onCreate}
      />
    </Cluster>
  );
}

/**
 * One desktop pill: the numbered switch chip with a hover-revealed × delete
 * affordance. The reveal uses the {@link useHoverReveal} primitive so the hidden
 * × is never a live click-target beside the visible number.
 */
function DesktopPill({
  desktop,
  index,
  active,
  windowCount,
  removable,
  onSwitch,
}: {
  desktop: Desktop;
  index: number;
  active: boolean;
  windowCount: number;
  removable: boolean;
  onSwitch: () => void;
}) {
  const { revealed, groupProps } = useHoverReveal();
  const label = `Desktop ${index + 1}`;
  const tooltip = `${label} · ${windowCount} window${windowCount === 1 ? "" : "s"}`;

  return (
    <Stack direction="row" align="center" gap="2xs" {...groupProps}>
      <WithTooltip content={tooltip}>
        <ToggleChip
          active={active}
          variant="ghost"
          onClick={onSwitch}
          title={tooltip}
        >
          {index + 1}
        </ToggleChip>
      </WithTooltip>
      {removable && (
        <span className={hoverRevealClass(revealed)}>
          <IconButton
            icon={MdClose}
            label={`Close ${label}`}
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              removeDesktop(desktop.id);
            }}
          />
        </span>
      )}
    </Stack>
  );
}
