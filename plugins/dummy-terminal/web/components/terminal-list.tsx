import { Shell } from "@plugins/shell/web/commands";
import { terminalPane } from "@plugins/terminal/web/views";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Plus } from "lucide-react";

export function TerminalList() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => Shell.OpenPane(terminalPane())}
        >
          <Plus className="size-4" />
          New Terminal
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
