import { type ReactNode, useState } from "react";
import { MdAdd } from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import {
  SortableList,
  SortableItem,
} from "@plugins/primitives/plugins/sortable-list/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { VariantEntry } from "@plugins/fields/plugins/variant/plugins/config/core";
import type { ViewTypeMeta } from "../../core";
import type { ResolvedViewInstance } from "../internal/resolve-instances";
import type { ViewActionsCore } from "../internal/use-view-model";
import { ViewSettingsPopover } from "./view-settings-popover";

/**
 * Config-mode switcher: drag-reorderable ghost chips (matching the read-only
 * `SegmentedControl variant="ghost"` look so chrome stays identical) + a trailing
 * `+` add menu. Click an inactive chip → select; click the **active** chip → open
 * its settings popover (rename / options sub-form / duplicate / delete).
 */
export function EditableViewSwitcher<T extends ViewTypeMeta>({
  instances,
  activeId,
  onSelect,
  actions,
  viewVariants,
}: {
  instances: ResolvedViewInstance<T>[];
  activeId: string;
  onSelect: (id: string) => void;
  actions: ViewActionsCore;
  viewVariants: Map<string, VariantEntry>;
}): ReactNode {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ids = instances.map((r) => r.instance.id);

  const onMove = (movedId: string, overId: string) => {
    const overIndex = ids.indexOf(overId);
    if (overIndex < 0) return;
    actions.reorderView(movedId, overIndex);
  };

  return (
    <Stack
      direction="row"
      align="center"
      gap="xs"
      // eslint-disable-next-line layout/no-adhoc-layout -- shrink-0 keeps the whole switcher rigid in the toolbar's flex row (a standalone trailing control, not a Frame slot)
      className="shrink-0"
    >
      <SortableList items={ids} onMove={onMove} orientation="horizontal">
        <Stack direction="row" align="center" gap="xs">
          {instances.map((r) => {
            // `r.viewType.icon` is the generic `T["icon"]`; widen to the
            // concrete `ViewTypeMeta` icon shape so JSX accepts `<Icon />`.
            const Icon: ViewTypeMeta["icon"] = r.viewType.icon;
            const id = r.instance.id;
            const isActive = id === activeId;
            const chip = (
              <ToggleChip
                active={isActive}
                variant="ghost"
                size="sm"
                icon={<Icon />}
                title={r.instance.name}
                onClick={() => {
                  if (isActive) setSettingsOpen((o) => !o);
                  else onSelect(id);
                }}
              >
                {r.instance.name}
              </ToggleChip>
            );
            return (
              <SortableItem key={id} id={id}>
                {() =>
                  isActive ? (
                    <InlinePopover
                      open={settingsOpen}
                      onOpenChange={setSettingsOpen}
                      align="end"
                      trigger={chip}
                      contentClassName="w-72"
                    >
                      <ViewSettingsPopover
                        instance={r}
                        actions={actions}
                        viewVariants={viewVariants}
                        onClose={() => setSettingsOpen(false)}
                      />
                    </InlinePopover>
                  ) : (
                    chip
                  )
                }
              </SortableItem>
            );
          })}
        </Stack>
      </SortableList>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<IconButton icon={MdAdd} label="Add view" size="sm" />}
        />
        <DropdownMenuContent align="end">
          {actions.available.map((v) => {
            const Icon = v.icon;
            return (
              <DropdownMenuItem
                key={v.type}
                onClick={() => actions.addView(v.type)}
              >
                <Icon className="size-4" />
                {v.title}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </Stack>
  );
}
