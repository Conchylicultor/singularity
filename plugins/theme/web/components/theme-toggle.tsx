import { MdLightMode, MdDarkMode } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useColorModeToggle } from "../internal/use-color-mode-toggle";

export function ThemeToggle() {
  const { dark, toggle } = useColorModeToggle();

  return (
    <IconButton
      icon={dark ? MdLightMode : MdDarkMode}
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    />
  );
}
