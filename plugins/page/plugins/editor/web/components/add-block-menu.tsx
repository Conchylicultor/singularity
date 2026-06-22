import { Button, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdAdd } from "react-icons/md";
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
    <ControlSizeProvider size="sm">
      <BlockTypeMenu
        align="start"
        side="bottom"
        onSelect={(block) => insert(block.type, block.empty?.() ?? {})}
        trigger={
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground gap-xs px-sm"
          >
            <MdAdd className="size-4" />
            Add block
          </Button>
        }
      />
    </ControlSizeProvider>
  );
}
