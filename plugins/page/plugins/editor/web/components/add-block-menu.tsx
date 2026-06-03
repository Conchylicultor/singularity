import { useMemo, useState } from "react";
import { MdAdd } from "react-icons/md";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Button } from "@/components/ui/button";
import { useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";

/**
 * "+ Add block" affordance at the bottom of the editor. Enumerates the insertable
 * block types from the `Editor.Block` dispatch slot (via `.useContributions()` —
 * each contribution carries its `block` handle), offering only the types that
 * declare a menu `label`. Selecting one creates a block at the end of the
 * document via the editor context's `insert`.
 */
export function AddBlockMenu() {
  const { insert } = useBlockEditor();
  const [open, setOpen] = useState(false);
  const contributions = Editor.Block.useContributions();

  const insertable = useMemo(
    () => contributions.map((c) => c.block).filter((b) => b.label),
    [contributions],
  );

  if (insertable.length === 0) return null;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="bottom"
      contentClassName="w-48 p-1"
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
    >
      <div className="flex flex-col">
        {insertable.map((block) => {
          const Icon = block.icon;
          return (
            <button
              key={block.type}
              type="button"
              className="hover:bg-accent flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
              onClick={() => {
                insert(block.type, block.empty?.() ?? {});
                setOpen(false);
              }}
            >
              {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
              {block.label}
            </button>
          );
        })}
      </div>
    </InlinePopover>
  );
}
