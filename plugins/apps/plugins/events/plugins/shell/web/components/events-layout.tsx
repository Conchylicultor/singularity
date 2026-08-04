import { MdEvent } from "react-icons/md";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Events } from "../slots";

/**
 * Events' main-area layout: the app shell wraps the `Events.Sidebar` left rail
 * (the events surfaces — the list, Sources — each contributed by its own
 * sub-plugin) around the Miller body. The sidebar header carries a small Events
 * brand.
 *
 * Sidebar-only, no app toolbar (the Pages/Settings shape): with no `chrome`-tier
 * toolbar above it, the active pane's own `PaneChrome` header owns the surface
 * top and hosts the sidebar toggle, instead of stacking an empty bar above it.
 */
export function EventsLayout() {
  return (
    <AppShellLayout
      sidebarSlot={Events.Sidebar}
      header={
        <Inline gap="xs">
          <MdEvent className="icon-auto" />
          <Text variant="label" className="font-semibold">
            Events
          </Text>
        </Inline>
      }
    >
      <MillerColumns />
    </AppShellLayout>
  );
}
