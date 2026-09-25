import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { openPane, useRoute } from "@plugins/primitives/plugins/pane/web";
import type {
  AppShellSidebarItem,
  AppShellSidebarNav,
  SidebarNavTarget,
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
  if (item.opens) return <SidebarNavOpensItem {...item} target={item.opens} />;
  return <SidebarNavRow {...item} onClick={item.onClick} isActive={false} />;
}

/**
 * The `opens` arm: opens its pane as the route root, and is active while the
 * route's root pane is that pane. A component of its own so only these rows
 * read the route (an `onClick` row neither needs it nor re-renders with it).
 */
function SidebarNavOpensItem({
  target,
  ...item
}: AppShellSidebarNav & { target: SidebarNavTarget }) {
  const route = useRoute();
  const isActive = route?.panes[0]?.pane === target.pane._internal;
  return (
    <SidebarNavRow
      {...item}
      isActive={isActive}
      onClick={() => openPane(target.pane, target.params, { mode: "root" })}
    />
  );
}

/**
 * The one rendering of a sidebar nav entry. The shell draws every
 * `AppShellSidebarNav` contribution through this, so two nav rows cannot differ
 * in inset, height, icon size or hover — a contributor supplies data, never
 * chrome. The rail inset comes from `SidebarMenu` itself (`rail-follow`), not
 * from a class written here; the row's height, padding, icon size, icon gap
 * and label weight are the sidebar-metrics theme tokens (through
 * `SidebarMenuButton`).
 *
 * The icon wears `--sidebar-icon` at rest (the row's own text colour unless a
 * theme quiets it) and the row's text colour while the row is hovered or
 * active.
 */
function SidebarNavRow({
  icon: Icon,
  title,
  onClick,
  badge: Badge,
  isActive,
}: Pick<AppShellSidebarNav, "icon" | "title" | "badge"> & {
  onClick: () => void;
  isActive: boolean;
}) {
  const iconClass =
    "size-sidebar-icon text-sidebar-icon group-hover/menu-button:text-current group-data-active/menu-button:text-current";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={onClick} isActive={isActive}>
          {Badge ? (
            <span className="relative">
              <Icon className={iconClass} />
              <Pin to="top-right" offset="2xs" outset decorative>
                <Badge />
              </Pin>
            </span>
          ) : (
            <Icon className={iconClass} />
          )}
          <span>{title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
