import { type ReactNode, useState } from "react";
import { MdAdd } from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSection,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  useHoverReveal,
  hoverRevealClass,
} from "@plugins/primitives/plugins/hover-reveal/web";
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
  const [addOpen, setAddOpen] = useState(false);
  // The `+` add-view button is chrome that only surfaces on hover/focus of the
  // switcher — kept revealed while its menu is open so it never vanishes under
  // the open dropdown when the pointer leaves.
  const { revealed, groupProps } = useHoverReveal();
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
      // eslint-disable-next-line layout/no-adhoc-layout -- flex-1 grows the switcher to absorb the toolbar's leading slack so its hover-reveal group (which carries groupProps) spans the empty gap up to the next control, making the `+` add button surface when the pointer is anywhere in that space — not just over the chips. min-width stays auto (no min-w-0), so the view chips never truncate; they hug their content and only the trailing empty space grows.
      className="flex-1"
      {...groupProps}
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
                      align="start"
                      trigger={chip}
                      width="lg"
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

      {/* The `+` add-view button is chrome that only surfaces on hover/focus of
          the switcher (group via `groupProps` on the root), kept visible while
          its menu is open. The reveal class sits on a `span` wrapper because the
          DOM button is owned by base-ui's trigger; ambient size comes from the
          surrounding `ControlSizeProvider`, with `IconButton` itself as the
          trigger's `render` target (mirroring CreatorsControl) — a provider as
          the render root would swallow base-ui's trigger wiring. */}
      <ControlSizeProvider size="sm">
        <span className={hoverRevealClass(revealed || addOpen)}>
          <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
            <DropdownMenuTrigger
              render={<IconButton icon={MdAdd} label="Add view" />}
            />
            <DropdownMenuContent align="start">
              {actions.availableSources.length === 1 &&
              !actions.availableSources[0]!.title ? (
                // Single implicit source → today's flat item list, unchanged.
                actions.availableSources[0]!.types.map((v) => {
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
                })
              ) : (
                // Multi-source → one labelled section per source (the composed
                // Group+GroupLabel primitive — a groupless label would crash).
                actions.availableSources.map((source) => (
                  <DropdownMenuSection
                    key={source.sourceId ?? ""}
                    label={source.title ?? source.sourceId ?? "Views"}
                  >
                    {source.types.map((v) => {
                      const Icon = v.icon;
                      return (
                        <DropdownMenuItem
                          key={v.type}
                          onClick={() => actions.addView(v.type, source.sourceId)}
                        >
                          <Icon className="size-4" />
                          {v.title}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSection>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </ControlSizeProvider>
    </Stack>
  );
}
