import { useEffect, useState } from "react";
import { MdLightMode, MdDarkMode, MdScience, MdOutlineScience } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";

export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <IconButton
      icon={dark ? MdLightMode : MdDarkMode}
      label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setDark((d) => !d)}
    />
  );
}

export function ExperimentalToggle() {
  const [experimental, setExperimental] = useState(() =>
    document.documentElement.classList.contains("experimental"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("experimental", experimental);
  }, [experimental]);

  return (
    <IconButton
      icon={experimental ? MdScience : MdOutlineScience}
      label={experimental ? "Disable experimental theme" : "Enable experimental theme"}
      onClick={() => setExperimental((e) => !e)}
    />
  );
}
