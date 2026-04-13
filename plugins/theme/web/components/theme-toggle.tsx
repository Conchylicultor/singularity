import { useEffect, useState } from "react";
import { MdLightMode, MdDarkMode, MdScience, MdOutlineScience } from "react-icons/md";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? <MdLightMode className="size-4" /> : <MdDarkMode className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        {dark ? "Switch to light mode" : "Switch to dark mode"}
      </TooltipContent>
    </Tooltip>
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
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExperimental((e) => !e)}
          >
            {experimental ? <MdScience className="size-4" /> : <MdOutlineScience className="size-4" />}
          </Button>
        }
      />
      <TooltipContent>
        {experimental ? "Disable experimental theme" : "Enable experimental theme"}
      </TooltipContent>
    </Tooltip>
  );
}
