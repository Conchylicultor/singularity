import { Rank } from "@plugins/primitives/plugins/rank/core";
import { buildTree, type TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { Block } from "@plugins/page/plugins/editor/core";
import { DIVIDER_TYPE } from "@plugins/page/plugins/divider/core";
import type { StoryNode } from "./types";

export function buildStoryTree(blocks: readonly Block[], pageId: string): StoryNode[] {
  const scoped = blocks.filter((b) => b.pageId === pageId); // defensive; resource is already scoped
  const sorted = [...scoped].sort((a, b) => Rank.compare(a.rank, b.rank));
  return buildTree(sorted).map((n, i) => toStoryNode(n, 0, i));
}

function toStoryNode(node: TreeNode<Block>, depth: number, index: number): StoryNode {
  return {
    id: node.id,
    type: node.type,
    data: node.data,
    role: node.type === DIVIDER_TYPE ? "break" : "content", // ← the ONLY block-type→role map
    depth,
    index,
    children: node.children.map((c, i) => toStoryNode(c, depth + 1, i)),
  };
}
