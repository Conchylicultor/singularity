import { useEffect } from "react";
import { setEditMode, useEditMode } from "@plugins/reorder/web";

export function EscHandler() {
  const editMode = useEditMode();
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);
  return null;
}
