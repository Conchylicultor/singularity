import { MdEdit, MdDone } from "react-icons/md";
import { setEditMode, useEditMode } from "@plugins/reorder/web";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function PenButton() {
  const editMode = useEditMode();
  const label = editMode ? "Exit edit mode" : "Reorder items";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={editMode ? "secondary" : "ghost"}
            size="icon"
            aria-label={label}
            aria-pressed={editMode}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? (
              <MdDone className="size-4" />
            ) : (
              <MdEdit className="size-4" />
            )}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
