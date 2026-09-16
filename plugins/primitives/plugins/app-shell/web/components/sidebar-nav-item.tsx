import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import type {
  AppShellSidebarItem,
  AppShellSidebarNav,
} from "./app-shell-layout";

/**
 * Renders one sidebar-slot contribution: a nav entry through the shell's own
 * row, a custom region as its component. `AppShellLayout` renders its sidebar
 * slot through this, and so must any other host that paints a sidebar slot
 * (e.g. the Pages tree pane) — so an entry looks the same wherever it appears.
 */
export function SidebarItem(item: AppShellSidebarItem) {
  if (item.component) {
    const Comp = item.component;
    return <Comp />;
  }
  return <SidebarNavItem {...item} />;
}

/**
 * The one rendering of a sidebar nav entry. The shell draws every
 * `AppShellSidebarNav` contribution through this, so two nav rows cannot differ
 * in inset, height, icon size or hover — a contributor supplies data, never
 * chrome. The rail inset comes from `SidebarMenu` itself (`rail-follow`), not
 * from a class written here.
 */
function SidebarNavItem({
  icon: Icon,
  title,
  onClick,
  badge: Badge,
}: AppShellSidebarNav) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={onClick}>
          {Badge ? (
            <span className="relative">
              <Icon className="size-4" />
              <Pin to="top-right" offset="2xs" outset decorative>
                <Badge />
              </Pin>
            </span>
          ) : (
            <Icon className="size-4" />
          )}
          <span>{title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
