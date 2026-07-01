import { useState, useEffect } from "react";
import { CommandPalette } from "../slots";
import { CommandPaletteDialog } from "./command-palette-dialog";

export function CommandPaletteRoot() {
  const [open, setOpen] = useState(false);
  const items = CommandPalette.Item.useContributions();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandPaletteDialog
      open={open}
      onClose={() => setOpen(false)}
      items={items}
    />
  );
}
