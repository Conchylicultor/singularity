import {
  SectionCount,
  SubHeading,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { DbSchemaFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
import { asPath } from "@plugins/framework/plugins/plugin-id/core";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

// Renders the db-schema facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const DB_SCHEMA_FACET_ID = "db-schema";

/** The plugin's schema footprint, or `null` when it touches no table at all. */
function dbSchema(node: PluginNode): DbSchemaFacetData | null {
  const data = node.facets?.[DB_SCHEMA_FACET_ID] as
    DbSchemaFacetData | undefined;
  if (!data) return null;
  if (
    data.tables.length === 0 &&
    data.entityExtensions.length === 0 &&
    data.extendedBy.length === 0
  )
    return null;
  return data;
}

/** No tables, no extensions ⇒ the host paints no card at all. */
export function useDbSchemaAvailable({ node }: { node: PluginNode }): boolean {
  return dbSchema(node) !== null;
}

export function DbSchemaCount({ node }: { node: PluginNode }) {
  const data = dbSchema(node);
  if (!data) return null;
  const parts: string[] = [];
  if (data.tables.length > 0)
    parts.push(
      `${data.tables.length} table${data.tables.length !== 1 ? "s" : ""}`,
    );
  const relCount = data.entityExtensions.length + data.extendedBy.length;
  if (relCount > 0)
    parts.push(`${relCount} extension${relCount !== 1 ? "s" : ""}`);
  return <SectionCount>{parts.join(" · ")}</SectionCount>;
}

export function DbSchemaDetailSection({ node }: { node: PluginNode }) {
  const data = dbSchema(node);
  if (!data) return null;

  const { tables, entityExtensions, extendedBy } = data;

  return (
    <Stack gap="md">
      {tables.length > 0 && (
        <SubHeading label="Tables" count={tables.length}>
          <Stack gap="2xs">
            {tables.map((t) => (
              <Text
                as={Line}
                variant="caption"
                key={t.name}
                className="gap-sm px-sm py-2xs"
              >
                <Text as="code" className="font-mono text-foreground">
                  {t.name}
                </Text>
                <span
                  className={cn(
                    "ml-auto font-mono text-3xs text-muted-foreground/50",
                    rigidClass(),
                  )}
                >
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
                as={Line}
                variant="caption"
                key={e.tableName}
                className="gap-sm px-sm py-2xs"
              >
                <PluginLink
                  name={e.parentPlugin}
                  label={asPath(e.parentPlugin)}
                />
                <Text as="code" className="font-mono text-muted-foreground">
                  {e.tableName}
                </Text>
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
                as={Line}
                variant="caption"
                key={e.tableName}
                className="gap-sm px-sm py-2xs"
              >
                <PluginLink
                  name={e.childPlugin}
                  label={asPath(e.childPlugin)}
                />
                <Text as="code" className="font-mono text-muted-foreground">
                  {e.tableName}
                </Text>
              </Text>
            ))}
          </Stack>
        </SubHeading>
      )}
    </Stack>
  );
}
