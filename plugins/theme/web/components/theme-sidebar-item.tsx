import { MdLightMode, MdDarkMode } from "react-icons/md";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useColorModeToggle } from "../internal/use-color-mode-toggle";

/**
 * Full-width sidebar row that toggles light/dark mode. Rendered as a Settings
 * app sidebar entry; shares its state with the toolbar `ThemeToggle` via
 * `useColorModeToggle`.
 */
export function ThemeSidebarItem() {
  const { dark, toggle } = useColorModeToggle();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={toggle}>
          {dark ? (
            <MdLightMode className="size-4" />
          ) : (
            <MdDarkMode className="size-4" />
          )}
          <span>{dark ? "Light mode" : "Dark mode"}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
