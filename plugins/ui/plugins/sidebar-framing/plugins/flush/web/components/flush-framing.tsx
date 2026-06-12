import { Sidebar, SidebarHeader, SidebarInset, SidebarProvider } from "@plugins/primitives/plugins/ui-kit/web";
import type { SidebarFramingProps } from "@plugins/primitives/plugins/app-shell/core";

/**
 * The default flush framing — extracted byte-for-byte from app-shell's original
 * sidebar branch. Pixel-identical to the pre-region app shell.
 */
export function FlushFraming({
  header,
  sidebarContent,
  body,
}: SidebarFramingProps) {
  return (
    <SidebarProvider className="h-full min-h-0">
      <Sidebar>
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
