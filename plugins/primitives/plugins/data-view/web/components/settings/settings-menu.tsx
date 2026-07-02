import { useState, type ReactNode } from "react";
import { MdTune } from "react-icons/md";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { DropdownMenuSeparator } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { DataViewSlots } from "../../slots";
import {
  DataViewSettingsProvider,
  type DataViewSettingsContextValue,
} from "./settings-context";

/**
 * The unified DataView settings menu — a gear `InlinePopover` replacing the old
 * custom-columns gear. Hosts two contributable scopes (precedent:
 * `SortBuilderPopover`'s two-section layout):
 *
 *  - **Current view** — per-instance settings (`scope: "view"`); properties and
 *    group-by are such contributions.
 *  - **DataView** — surface-wide settings (`scope: "global"`); custom-columns'
 *    "Fields" UI is one such contribution (it imports this slot directly — the
 *    dependency is inverted, so the host names no individual setting).
 *
 * Each scope renders its applicable `DataViewSlots.Setting` contributions in
 * `order` uniformly through `renderIsolated` (error-boundary-isolated). The
 * contributions own their own sub-labels ("Properties", "Group by", "Fields"), so
 * the scopes are separated structurally by a `DropdownMenuSeparator` rather than
 * redundant scope headers.
 */
export function DataViewSettingsMenu(props: {
  context: DataViewSettingsContextValue;
}): ReactNode {
  const { context } = props;
  const [open, setOpen] = useState(false);

  const settings = DataViewSlots.Setting.useContributions();
  const byOrder = (a: { order?: number }, b: { order?: number }) =>
    (a.order ?? 0) - (b.order ?? 0);
  // Each contribution declares its own applicability (`isApplicable`); the menu
  // stays generic — it never names group-by / properties. A setting filtered out
  // here is the one that would self-hide, so the separator and the gear itself
  // never show an empty section.
  const applicable = (s: (typeof settings)[number]) =>
    s.isApplicable?.(context) ?? true;
  const viewSettings = settings
    .filter((s) => s.scope === "view" && applicable(s))
    .sort(byOrder);
  const globalSettings = settings
    .filter((s) => s.scope === "global" && applicable(s))
    .sort(byOrder);

  const viewScopeVisible = viewSettings.length > 0;
  const globalScopeVisible = globalSettings.length > 0;

  // Nothing to configure → no gear at all (host always mounts this component).
  if (!viewScopeVisible && !globalScopeVisible) return null;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="md"
      trigger={
        <IconButton icon={MdTune} label="Data view settings" variant="ghost" />
      }
    >
      <DataViewSettingsProvider value={context}>
        <Stack gap="sm">
          {viewScopeVisible ? (
            <Stack gap="sm">
              {viewSettings.map((c) => (
                <div key={c.id}>
                  {renderIsolated(DataViewSlots.Setting.id, c as unknown as Contribution, {})}
                </div>
              ))}
            </Stack>
          ) : null}
          {viewScopeVisible && globalScopeVisible ? (
            <DropdownMenuSeparator />
          ) : null}
          {globalScopeVisible ? (
            <Stack gap="sm">
              {globalSettings.map((c) => (
                <div key={c.id}>
                  {renderIsolated(DataViewSlots.Setting.id, c as unknown as Contribution, {})}
                </div>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </DataViewSettingsProvider>
    </InlinePopover>
  );
}
