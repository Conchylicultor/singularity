import { type ReactNode, useRef, useState } from "react";
import { MdAdd, MdExpandMore, MdSettings } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ControlPanelPopover } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import type { ViewTypeMeta } from "../../core";
import type { ResolvedViewInstance } from "../internal/resolve-instances";
import type { ViewActionsCore } from "../internal/use-view-model";
import { ViewSettingsPopover } from "./view-settings-popover";
import { AddViewMenuItems } from "./add-view-menu-items";

/**
 * The view switcher folded into ONE chip: the active view's icon and name and a
 * chevron. Clicking it opens a menu of the other views, an "Add view" submenu
 * (the same rows the strip's `+` menu shows — {@link AddViewMenuItems}), and
 * "View settings…", which opens the strip's own `ViewSettingsPopover` hung off
 * the chip.
 *
 * Same inputs as `EditableViewSwitcher`, so a host can build both from one
 * model and let its toolbar arrangement pick. No drag reorder: a chip has no
 * row of views to drag within.
 *
 * The settings panel is positioned against the chip rather than triggered by
 * it: the chip is already the menu's trigger, and one element cannot trigger
 * two popups without one click opening both. So the panel opens only from its
 * menu row.
 */
export function CollapsedViewSwitcher<T extends ViewTypeMeta>({
  instances,
  activeId,
  onSelect,
  actions,
}: {
  instances: ResolvedViewInstance<T>[];
  activeId: string;
  onSelect: (id: string) => void;
  actions: ViewActionsCore;
}): ReactNode {
  const chipRef = useRef<HTMLButtonElement>(null);
  // WHICH view's settings are open (see EditableViewSwitcher): a boolean would
  // silently re-aim an open panel at a different view when the active one changes.
  const [settingsForId, setSettingsForId] = useState<string | null>(null);

  const active =
    instances.find((r) => r.instance.id === activeId) ?? instances[0] ?? null;
  if (!active) return null;
  // `viewType.icon` is the generic `T["icon"]`; widen to the concrete shape.
  const ActiveIcon: ViewTypeMeta["icon"] = active.viewType.icon;
  const others = instances.filter((r) => r.instance.id !== active.instance.id);
  const settingsInstance = settingsForId === active.instance.id ? active : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={chipRef}
              variant="secondary"
              shape="pill"
              aria-label={`View: ${active.instance.name}`}
            >
              <ActiveIcon />
              {active.instance.name}
              <MdExpandMore />
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          {others.map((r) => {
            const Icon: ViewTypeMeta["icon"] = r.viewType.icon;
            return (
              <DropdownMenuItem
                key={r.instance.id}
                onClick={() => {
                  setSettingsForId(null);
                  onSelect(r.instance.id);
                }}
              >
                <Icon className="size-4" />
                {r.instance.name}
              </DropdownMenuItem>
            );
          })}
          {others.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MdAdd className="size-4" />
              Add view
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <AddViewMenuItems actions={actions} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={() => setSettingsForId(active.instance.id)}
          >
            <MdSettings className="size-4" />
            View settings…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {settingsInstance ? (
        <ControlPanelPopover
          anchor={chipRef}
          open
          onOpenChange={(open) => {
            if (!open) setSettingsForId(null);
          }}
          align="start"
          label={`${settingsInstance.instance.name} settings`}
        >
          <ViewSettingsPopover
            instance={settingsInstance}
            actions={actions}
            onClose={() => setSettingsForId(null)}
          />
        </ControlPanelPopover>
      ) : null}
    </>
  );
}
