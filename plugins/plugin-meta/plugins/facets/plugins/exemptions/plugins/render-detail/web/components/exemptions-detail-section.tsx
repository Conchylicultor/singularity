import {
  SectionCount,
  SubHeading,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import { asPath } from "@plugins/framework/plugins/plugin-id/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ExemptionsData } from "@plugins/plugin-meta/plugins/facets/plugins/exemptions/core";

// Read `node.facets[id]` directly (as every render host does) rather than
// importing the build-time `facets/core` barrel, which would drag fs into the
// browser bundle. The type-only import from the facet core is erased.
const EXEMPTIONS_FACET_ID = "exemptions";

function exemptions(node: PluginNode): ExemptionsData | null {
  const data = node.facets?.[EXEMPTIONS_FACET_ID] as ExemptionsData | undefined;
  if (!data) return null;
  if (data.declared.length === 0 && data.exemptedBy.length === 0) return null;
  return data;
}

/** Nothing declared and nobody exempted ⇒ the host paints no card at all. */
export function useExemptionsAvailable({
  node,
}: {
  node: PluginNode;
}): boolean {
  return exemptions(node) !== null;
}

export function ExemptionsCount({ node }: { node: PluginNode }) {
  const data = exemptions(node);
  if (!data) return null;
  const parts: string[] = [];
  if (data.declared.length > 0) parts.push(`${data.declared.length} declared`);
  if (data.exemptedBy.length > 0)
    parts.push(`${data.exemptedBy.length} exempted by`);
  return <SectionCount>{parts.join(" · ")}</SectionCount>;
}

export function ExemptionsDetailSection({ node }: { node: PluginNode }) {
  const data = exemptions(node);
  if (!data) return null;
  return (
    <Stack gap="md">
      {data.declared.length > 0 && (
        <SubHeading label="Exempts itself from" count={data.declared.length}>
          <Stack gap="2xs">
            {data.declared.map((e) => (
              <Text
                as="code"
                variant="caption"
                key={`${e.rule}:${e.paths.join(",")}`}
                className="truncate px-xs font-mono text-foreground"
              >
                {e.rule} — {e.paths.join(", ")} ({e.kind})
              </Text>
            ))}
          </Stack>
        </SubHeading>
      )}
      {data.exemptedBy.length > 0 && (
        <SubHeading label="Exempted by" count={data.exemptedBy.length}>
          <Stack gap="2xs">
            {data.exemptedBy.map((x) => (
              <Text key={x.plugin} variant="caption">
                <PluginLink name={x.plugin} label={asPath(x.plugin)} /> (
                {x.debt} debt)
              </Text>
            ))}
          </Stack>
        </SubHeading>
      )}
    </Stack>
  );
}
