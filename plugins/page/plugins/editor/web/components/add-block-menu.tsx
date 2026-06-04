import { MdAdd } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { useBlockEditor } from "../block-editor-context";
import { BlockTypeMenu } from "./block-type-menu";

/**
 * "+ Add block" affordance at the bottom of the editor. Renders the shared
 * `BlockTypeMenu`; selecting a type creates a block at the end of the document
 * via the editor context's `insert`.
 */
export function AddBlockMenu() {
  const { insert } = useBlockEditor();

  return (
    <BlockTypeMenu
      align="start"
      side="bottom"
      onSelect={(block) => insert(block.type, block.empty?.() ?? {})}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2 text-sm"
        >
          <MdAdd className="size-4" />
          Add block
        </Button>
      }
    />
  );
}
