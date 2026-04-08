import { Shell } from "@plugins/shell/web/commands";
import { dummyDetailPane } from "@plugins/dummy-detail/web/views";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { id: "1", label: "Alpha" },
  { id: "2", label: "Beta" },
  { id: "3", label: "Gamma" },
];

export function DummyList() {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton
            onClick={() =>
              Shell.OpenPane(
                dummyDetailPane({ itemId: item.id, label: item.label })
              )
            }
          >
            {item.label}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
