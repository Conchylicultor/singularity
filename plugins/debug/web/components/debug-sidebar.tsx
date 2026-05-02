import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Debug } from "../slots";

export function DebugSidebar() {
  const items = Debug.Item.useContributions();
  return (
    <SidebarMenu>
      {items.map((item) => (
        <PluginErrorBoundary key={item.id} slot="debug.item" label={item.title}>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={item.onClick}>
              <item.icon className="size-4" />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </PluginErrorBoundary>
      ))}
    </SidebarMenu>
  );
}
