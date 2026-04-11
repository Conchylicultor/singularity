import { useEffect, useState } from "react";
import { MdTerminal } from "react-icons/md";
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
            <MdTerminal className="size-3.5 text-muted-foreground" />
            <span className="text-xs">{ch}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
