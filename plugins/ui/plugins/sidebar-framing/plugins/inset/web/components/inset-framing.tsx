import { Sidebar, SidebarHeader, SidebarInset, SidebarProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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
          <SidebarHeader className="h-chrome-bar justify-center px-chrome py-none">
            {header}
          </SidebarHeader>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{sidebarContent}</div>
      </Sidebar>

      <SidebarInset className="min-w-0">{body}</SidebarInset>
    </SidebarProvider>
  );
}
