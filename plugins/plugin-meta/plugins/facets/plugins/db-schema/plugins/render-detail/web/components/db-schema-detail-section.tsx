import {
  Section,
  SubHeading,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { DbSchemaFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
import { asPath } from "@plugins/framework/plugins/plugin-id/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

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
                <Frame
                  key={t.name}
                  className="text-caption px-sm py-2xs"
                  content={
                    <Text as="code" className="font-mono text-foreground">
                      {t.name}
                    </Text>
                  }
                  trailing={
                    <span className="font-mono text-3xs text-muted-foreground/50">
                      {t.varName}
                    </span>
                  }
                />
              ))}
            </Stack>
          </SubHeading>
        )}

        {entityExtensions.length > 0 && (
          <SubHeading label="Extends" count={entityExtensions.length}>
            <Stack gap="2xs">
              {entityExtensions.map((e) => (
                <Frame
                  key={e.tableName}
                  className="text-caption px-sm py-2xs"
                  leading={
                    <PluginLink name={e.parentPlugin} label={asPath(e.parentPlugin)} />
                  }
                  content={
                    <Text as="code" className="font-mono text-muted-foreground">
                      {e.tableName}
                    </Text>
                  }
                />
              ))}
            </Stack>
          </SubHeading>
        )}

        {extendedBy.length > 0 && (
          <SubHeading label="Extended by" count={extendedBy.length}>
            <Stack gap="2xs">
              {extendedBy.map((e) => (
                <Frame
                  key={e.tableName}
                  className="text-caption px-sm py-2xs"
                  leading={
                    <PluginLink name={e.childPlugin} label={asPath(e.childPlugin)} />
                  }
                  content={
                    <Text as="code" className="font-mono text-muted-foreground">
                      {e.tableName}
                    </Text>
                  }
                />
              ))}
            </Stack>
          </SubHeading>
        )}
      </Stack>
    </Section>
  );
}
