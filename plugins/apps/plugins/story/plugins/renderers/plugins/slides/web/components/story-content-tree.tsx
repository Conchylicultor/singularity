import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";
import { Story } from "@plugins/apps/plugins/story/plugins/render/web";

/**
 * Recursively renders a forest of StoryNodes as slide content. Keeps the
 * renderer content-type-agnostic: every content node dispatches through
 * Story.Content (each block type owns its own widget), while a "break" role is
 * interpreted structurally as a rule — never as a block, never named "divider".
 */
export function StoryContentTree({ nodes }: { nodes: StoryNode[] }) {
  return (
    <>
      {nodes.map((node) =>
        node.role === "break" ? (
          // A nested divider inside a slide → structural rule, not content.
          <hr key={node.id} className="my-3 border-border" />
        ) : (
          // Indent by depth so nested blocks read as a hierarchy.
          <div key={node.id} style={{ marginLeft: node.depth * 16 }}>
            <Story.Content.Dispatch node={node} />
            {node.children.length > 0 && <StoryContentTree nodes={node.children} />}
          </div>
        ),
      )}
    </>
  );
}
