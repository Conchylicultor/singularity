import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ComponentType, type ReactNode } from "react";
import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";

export function SidebarPaneSection({
  icon: Icon,
  title,
  labelExtra: LabelExtra,
  defaultOpen = true,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  labelExtra?: ComponentType;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { open, triggerProps, contentId } = useCollapsible({ defaultOpen });
  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SidebarGroupLabel
        className="group/label shrink-0 cursor-pointer select-none hover:text-sidebar-foreground"
        onClick={triggerProps.onClick}
        aria-expanded={triggerProps["aria-expanded"]}
        aria-controls={triggerProps["aria-controls"]}
      >
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off icon offset inside shadcn SidebarGroupLabel label row */}
        <Icon className="mr-2 size-4" />
        {title}
        {LabelExtra && <LabelExtra />}
        <CollapsibleChevron open={open} className="ml-auto size-4" />
      </SidebarGroupLabel>
      {open && (
        <SidebarGroupContent
          id={contentId}
          className="min-h-0 flex flex-1 flex-col overflow-hidden"
        >
          {children}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}
