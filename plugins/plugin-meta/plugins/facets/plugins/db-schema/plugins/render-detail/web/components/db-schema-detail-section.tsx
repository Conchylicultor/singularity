import {
  Section,
  SubHeading,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { DbSchemaFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
import { asPath } from "@plugins/framework/plugins/plugin-id/core";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";

// Renders the db-schema facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const DB_SCHEMA_FACET_ID = "db-schema";

export function DbSchemaDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[DB_SCHEMA_FACET_ID] as DbSchemaFacetData | undefined;
  if (!data) return null;

  const { tables, entityExtensions, extendedBy } = data;
  if (
    tables.length === 0 &&
    entityExtensions.length === 0 &&
    extendedBy.length === 0
  )
    return null;

  const parts: string[] = [];
  if (tables.length > 0)
    parts.push(`${tables.length} table${tables.length !== 1 ? "s" : ""}`);
  const relCount = entityExtensions.length + extendedBy.length;
  if (relCount > 0)
    parts.push(`${relCount} extension${relCount !== 1 ? "s" : ""}`);

  return (
    <Section title="Database" count={parts.join(" · ")}>
      <Stack gap="md">
        {tables.length > 0 && (
          <SubHeading label="Tables" count={tables.length}>
            <Stack gap="2xs">
              {tables.map((t) => (
                <Text
                  as="div"
                  variant="caption"
                  key={t.name}
                  className="flex items-center gap-sm px-sm py-2xs"
                >
                  <code className="min-w-0 truncate font-mono text-foreground">
                    {t.name}
                  </code>
                  <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground/50">
                    {t.varName}
                  </span>
                </Text>
              ))}
            </Stack>
          </SubHeading>
        )}

        {entityExtensions.length > 0 && (
          <SubHeading label="Extends" count={entityExtensions.length}>
            <Stack gap="2xs">
              {entityExtensions.map((e) => (
                <Text
                  as="div"
                  variant="caption"
                  key={e.tableName}
                  className="flex items-center gap-sm px-sm py-2xs"
                >
                  <PluginLink name={e.parentPlugin} label={asPath(e.parentPlugin)} />
                  <code className="min-w-0 truncate font-mono text-muted-foreground">
                    {e.tableName}
                  </code>
                </Text>
              ))}
            </Stack>
          </SubHeading>
        )}

        {extendedBy.length > 0 && (
          <SubHeading label="Extended by" count={extendedBy.length}>
            <Stack gap="2xs">
              {extendedBy.map((e) => (
                <Text
                  as="div"
                  variant="caption"
                  key={e.tableName}
                  className="flex items-center gap-sm px-sm py-2xs"
                >
                  <PluginLink name={e.childPlugin} label={asPath(e.childPlugin)} />
                  <code className="min-w-0 truncate font-mono text-muted-foreground">
                    {e.tableName}
                  </code>
                </Text>
              ))}
            </Stack>
          </SubHeading>
        )}
      </Stack>
    </Section>
  );
}
