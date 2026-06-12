import type { StoryNode } from "./types";

/**
 * Serialize a StoryNode forest to an indented bullet outline.
 *
 * - Two spaces of indent per `depth`.
 * - A `role: "break"` node renders as a bare `---` line (no bullet).
 * - A content node renders as `- ${text}`, where text is pragmatically pulled
 *   from `(data as { text?: string }).text ?? ""`. Empty text still emits `-`
 *   so structure stays visible.
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
        const text = (n.data as { text?: string }).text ?? "";
        lines.push(text ? `${indent}- ${text}` : `${indent}-`);
      }
      walk(n.children);
    }
  };
  walk(nodes);
  return lines.join("\n");
}
