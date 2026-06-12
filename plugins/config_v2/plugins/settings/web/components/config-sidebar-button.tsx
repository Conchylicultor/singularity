import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@plugins/primitives/plugins/ui-kit/web";
import { MdTune } from "react-icons/md";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import { configNavPane } from "../internal/panes";
import { useConflictPaths } from "../internal/use-conflicts";

export function ConfigSidebarButton() {
  const conflicts = useConflictPaths();
  const hasConflicts = !conflicts.pending && conflicts.data.length > 0;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => openPane(configNavPane, {}, { mode: "root" })}
        >
          <span className="relative">
            <MdTune className="size-4" />
            {hasConflicts && (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-warning" />
            )}
          </span>
          <span>Config</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
