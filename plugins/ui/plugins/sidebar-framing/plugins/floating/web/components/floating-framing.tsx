import {
  Sidebar,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { SidebarFramingProps } from "@plugins/primitives/plugins/app-shell/core";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";
import { fillClasses } from "@plugins/primitives/plugins/css/plugins/fill/web";

/** Floating framing — the sidebar renders as a rounded, detached card. */
export function FloatingFraming({
  header,
  sidebarContent,
  body,
}: SidebarFramingProps) {
  return (
    <SidebarProvider className="h-full min-h-0">
      <Sidebar variant="floating">
        {header && (
          // eslint-disable-next-line layout/no-adhoc-layout -- justify-center centers content within shadcn SidebarHeader's own flex column
          <SidebarHeader className="h-chrome-bar justify-center px-chrome py-none">
            {header}
          </SidebarHeader>
        )}
        {/* Fills shadcn Sidebar's internal flex column: takes the leftover
            height AND gives below its content, so a long tree scrolls instead of
            pushing the header off. */}
        <Stack gap="none" className={fillClasses("y")}>
          {sidebarContent}
        </Stack>
      </Sidebar>

      <SidebarInset className={yieldClass("x")}>{body}</SidebarInset>
    </SidebarProvider>
  );
}
