import { Section, type PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";

export function SourcePathSection({ node }: { node: PluginNode }) {
  return (
    <Section title="Source path">
      <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
        plugins/{node.path}
      </code>
    </Section>
  );
}
