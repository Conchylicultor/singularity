import {
  Section,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CommandDef } from "@plugins/plugin-meta/plugins/facets/plugins/commands/core";

// Renders the commands facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const COMMANDS_FACET_ID = "commands";

export function CommandsDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[COMMANDS_FACET_ID] as CommandDef[] | undefined;
  if (!data || data.length === 0) return null;

  return (
    <Section title="Commands" count={String(data.length)}>
      <Stack gap="2xs">
        {data.map((c) => (
          <Text
            as="div"
            variant="caption"
            key={c.commandId}
            className="flex items-center gap-sm px-sm py-2xs"
          >
            <code className="min-w-0 truncate font-mono text-foreground">
              {c.groupName}.{c.memberName}
            </code>
            <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground/50">
              {c.commandId}
            </span>
          </Text>
        ))}
      </Stack>
    </Section>
  );
}
