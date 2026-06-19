import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { MdTune } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { configNavPane } from "../internal/panes";
import { useConflictPaths } from "../internal/use-conflicts";

export function ConfigSidebarButton() {
  const conflicts = useConflictPaths();
  const hasConflicts = !conflicts.pending && conflicts.data.length > 0;
  const openPane = useOpenPane();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => openPane(configNavPane, {}, { mode: "root" })}
        >
          <span className="relative">
            <MdTune className="size-4" />
            {hasConflicts && (
              <Pin to="top-right" offset="2xs" outset decorative className="size-2 rounded-full bg-warning" />
            )}
          </span>
          <span>Config</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
