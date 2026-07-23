import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ComponentType } from "react";
import type { AppShellSidebarItem } from "./app-shell-layout";

export function SidebarNavItem({
  icon: Icon,
  title,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenu className="px-sm">
      <SidebarMenuItem>
        <SidebarMenuButton onClick={onClick}>
          <Icon className="size-4" />
          <span>{title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function sidebarNavItem(opts: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}): AppShellSidebarItem {
  return {
    title: opts.title,
    icon: opts.icon,
    component: () => (
      <SidebarNavItem
        icon={opts.icon}
        title={opts.title}
        onClick={opts.onClick}
      />
    ),
  };
}
