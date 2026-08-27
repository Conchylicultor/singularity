import { MdClose } from "react-icons/md";
import { type LexicalNode, type NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { activeDataInlineNode } from "../../core";
import { renderInlineChip } from "./render-inline-chip";

/**
 * The browser half: the SAME family declared in `core/node.ts`, with the chip
 * rendering added. Extending the core spec rather than re-declaring one is what
 * makes the browser's class and the server's the same token type by
 * construction — see that module for why the declaration lives there.
 */
export const activeDataInlineWebNode = activeDataInlineNode.decorated({
  className: "inline-flex align-middle mx-0.5",
  render: ({ text }, node) => (
    <ActiveDataInlineChip text={text} nodeKey={node.getKey()} />
  ),
});

/** The Lexical class to register in an editor's `nodes` config. */
export const ActiveDataInlineNode = activeDataInlineWebNode.Node;

// Renders the chip that owns this token, through the one registry read that
// also applies the boundary (`renderInlineChip`). An unclaimed token stays raw
// text — which is what lets a document holding this node hydrate correctly in a
// composition without the owning chip plugin.
//
// Only ever rendered from `decorate()`, i.e. inside a `LexicalComposer`, so it
// can read the editor context. When the editor is editable it wraps the chip in
// a generic hover-reveal × removal affordance — every inline chip gets it for
// free, with zero per-chip wiring. Read surfaces render the chip directly (via
// linkify/segments), never through this node, so they never get the × (mirrors
// paste-images' ImageNode).
function ActiveDataInlineChip({
  text,
  nodeKey,
}: {
  text: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  // Treat the chip as one atomic token: when a selection spans it, Lexical marks
  // the whole decorator selected — we paint a ring on the entire chip (and
  // suppress the native text highlight on its label below) so it reads as "the
  // chip is grabbed as an object", never "its inner characters are selected".
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const chip = renderInlineChip(text);
  if (chip === null) return <>{text}</>;

  if (!editor.isEditable()) return chip;

  return (
    <Inline
      gap="none"
      className={cn(
        hoverRevealGroup,
        "relative align-middle rounded-md",
        // Never let the browser paint a per-character text highlight inside the
        // chip; the whole-chip ring below is the only selection affordance.
        "select-none",
        isSelected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
      contentEditable={false}
    >
      {chip}
      <Pin to="top-right" offset="xs" outset>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            editor.update(() => {
              const node = editor.getEditorState()._nodeMap.get(nodeKey);
              if (node) (node as LexicalNode).remove();
            });
          }}
          className={cn(
            hoverRevealTarget,
            "bg-background/90 border-border text-foreground size-4 rounded-full border",
          )}
          aria-label="Remove"
        >
          <Center className="size-full">
            <MdClose className="size-3" />
          </Center>
        </button>
      </Pin>
    </Inline>
  );
}

export function $createActiveDataInlineNode(text: string): LexicalNode {
  return activeDataInlineWebNode.create({ text });
}

export function $isActiveDataInlineNode(
  node: LexicalNode | null | undefined,
): boolean {
  return activeDataInlineNode.is(node);
}
