import { useMemo } from "react";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { Block } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";

export function BlockRow({ node, depth }: { node: TreeNode<Block>; depth: number }) {
  const { focusedBlockId, makeBlockAPI } = useBlockEditor();

  const api = useMemo(() => makeBlockAPI(node.id), [makeBlockAPI, node.id]);
  const isFocused = focusedBlockId === node.id;

  const childElements = node.children.length > 0 ? (
    <div className="pl-6">
      {node.children.map((child) => (
        <BlockRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  ) : null;

  return (
    <Editor.Block.Dispatch
      block={node}
      isFocused={isFocused}
      editor={api}
    >
      {childElements}
    </Editor.Block.Dispatch>
  );
}
