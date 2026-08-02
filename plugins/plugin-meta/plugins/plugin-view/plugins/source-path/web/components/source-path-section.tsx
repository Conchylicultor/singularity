import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";

/**
 * The plugin's path — one line, so it rides the section header as `summary`
 * rather than sitting behind a chevron.
 */
export function SourcePathSummary({ node }: { node: PluginNode }) {
  return (
    <code className="rounded-md bg-muted px-sm py-xs font-mono text-2xs text-muted-foreground">
      plugins/{node.path}
    </code>
  );
}
