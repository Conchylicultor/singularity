import { useEffect, useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { buildTree, type TreeNode } from "@plugins/primitives/plugins/tree/core";
import { blocksResource, type Block } from "../../core";
import { BlockEditorProvider, useBlockEditor } from "../block-editor-context";
import { BlockRow } from "./block-row";

function flattenTree<T>(nodes: TreeNode<T>[]): T[] {
  const result: T[] = [];
  for (const node of nodes) {
    result.push(node);
    result.push(...flattenTree(node.children));
  }
  return result;
}

export function BlockEditor({ documentId }: { documentId: string }) {
  return (
    <BlockEditorProvider documentId={documentId}>
      <BlockEditorInner documentId={documentId} />
    </BlockEditorProvider>
  );
}

function BlockEditorInner({ documentId }: { documentId: string }) {
  const result = useResource(blocksResource);
  const { setFlatOrder } = useBlockEditor();

  const { roots, flat } = useMemo(() => {
    if (result.pending) return { roots: [] as TreeNode<Block>[], flat: [] as Block[] };
    const filtered = result.data
      .filter((b) => b.documentId === documentId)
      .sort((a, b) => Rank.compare(a.rank, b.rank));
    const r = buildTree(filtered);
    return { roots: r, flat: flattenTree(r) };
  }, [result, documentId]);

  useEffect(() => {
    setFlatOrder(flat);
  }, [flat, setFlatOrder]);

  if (result.pending) {
    return <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      {roots.map((node) => (
        <BlockRow key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}
