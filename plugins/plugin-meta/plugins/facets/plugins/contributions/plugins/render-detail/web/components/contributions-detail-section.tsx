import {
  Section,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  contributionId,
  type ContributionsFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

// Renders the contributions facet's own data. Read `node.facets[id]` directly
// (as every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const CONTRIBUTIONS_FACET_ID = "contributions";

export function ContributionsDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[CONTRIBUTIONS_FACET_ID] as
    | ContributionsFacetData
    | undefined;
  if (!data) return null;

  const { static: contribs } = data;
  if (contribs.length === 0) return null;

  return (
    <Section
      title="Contributions"
      count={`${contribs.length} contribution${contribs.length !== 1 ? "s" : ""}`}
    >
      {contribs.length > 0 && (
        <Stack gap="2xs">
          {contribs.map((c, i) => {
            const id = contributionId(c);
            return (
              <Text
                as="div"
                variant="caption"
                key={`${c.slot}:${id ?? i}`}
                className="flex items-center gap-sm px-sm py-2xs"
              >
                {c.definerPluginId ? (
                  <PluginLink
                    name={c.definerPluginId}
                    label={c.slot}
                    className="font-mono text-foreground hover:underline"
                  />
                ) : (
                  <code className="font-mono text-foreground">{c.slot}</code>
                )}
                {id && (
                  <code className="ml-auto truncate font-mono text-muted-foreground/60">
                    {id}
                  </code>
                )}
              </Text>
            );
          })}
        </Stack>
      )}
    </Section>
  );
}
