import { useState, type ComponentType, type ReactNode } from "react";
import { MdChevronRight } from "react-icons/md";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

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
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SidebarGroupLabel
        className="group/label shrink-0 cursor-pointer select-none hover:text-sidebar-foreground"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon className="mr-2 size-4" />
        {title}
        {LabelExtra && <LabelExtra />}
        <MdChevronRight
          className={`ml-auto size-4 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        />
      </SidebarGroupLabel>
      {isOpen && (
        <SidebarGroupContent className="min-h-0 overflow-auto">
          {children}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}
