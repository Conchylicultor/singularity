import { plainOf } from "@plugins/page/plugins/editor/core";
import type { StoryNode } from "./types";

/**
 * Serialize a StoryNode forest to an indented bullet outline.
 *
 * - Two spaces of indent per `depth`.
 * - A `role: "break"` node renders as a bare `---` line (no bullet).
 * - A content node renders as `- ${text}`, where text is flattened from the
 *   block's `data.text` via `plainOf` (handles both the legacy string and the
 *   runs array — a raw read would stringify runs as `[object Object]`). Empty
 *   text still emits `-` so structure stays visible.
 * - Children are recursed after each node.
 *
 * Generic, deterministic serialization; per-lens *framing* (blog/slides prompt
 * wrapping) stays in the renderer, not here.
 */
export function outlineToBullets(nodes: StoryNode[]): string {
  const lines: string[] = [];
  const walk = (ns: StoryNode[]): void => {
    for (const n of ns) {
      const indent = "  ".repeat(n.depth);
      if (n.role === "break") {
        lines.push(`${indent}---`);
      } else {
        const text = plainOf((n.data as { text?: unknown }).text);
        lines.push(text ? `${indent}- ${text}` : `${indent}-`);
      }
      walk(n.children);
    }
  };
  walk(nodes);
  return lines.join("\n");
}
