import { Sidebar, SidebarHeader, SidebarInset, SidebarProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { SidebarFramingProps } from "@plugins/primitives/plugins/app-shell/core";

/**
 * Inset framing — the main area floats as a rounded inset card (shadcn's
 * `inset` variant auto-rounds `SidebarInset`).
 */
export function InsetFraming({
  header,
  sidebarContent,
  body,
}: SidebarFramingProps) {
  return (
    <SidebarProvider className="h-full min-h-0">
      <Sidebar variant="inset">
        {header && (
          // eslint-disable-next-line layout/no-adhoc-layout -- justify-center centers content within shadcn SidebarHeader's own flex column
          <SidebarHeader className="h-chrome-bar justify-center px-chrome py-none">
            {header}
          </SidebarHeader>
        )}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of shadcn Sidebar's internal flex column */}
        <Stack gap="none" className="min-h-0 flex-1">{sidebarContent}</Stack>
      </Sidebar>

      {/* eslint-disable-next-line layout/no-adhoc-layout -- min-w-0 lets shadcn SidebarInset shrink within its flex row instead of overflowing */}
      <SidebarInset className="min-w-0">{body}</SidebarInset>
    </SidebarProvider>
  );
}
