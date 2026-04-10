import { useEffect, useState } from "react";
import { Shell } from "@plugins/shell/web/commands";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { logPane } from "../views";

export function LogsSidebar() {
  const [channels, setChannels] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/logs/channels")
      .then((r) => r.json())
      .then((data: { channels: string[] }) => setChannels(data.channels));
  }, []);

  return (
    <SidebarMenu>
      {channels.map((ch) => (
        <SidebarMenuItem key={ch}>
          <SidebarMenuButton
            onClick={() => Shell.OpenPane(logPane({ channel: ch }))}
          >
            {ch}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
