import {
  Section,
  SubHeading,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { DbSchemaFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
import { asPath } from "@plugins/framework/plugins/plugin-id/core";

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
      <div className="flex flex-col gap-3">
        {tables.length > 0 && (
          <SubHeading label="Tables" count={tables.length}>
            <div className="flex flex-col gap-0.5">
              {tables.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center gap-2 px-2 py-0.5 text-xs"
                >
                  <code className="min-w-0 truncate font-mono text-foreground">
                    {t.name}
                  </code>
                  <span className="ml-auto shrink-0 font-mono text-3xs text-muted-foreground/50">
                    {t.varName}
                  </span>
                </div>
              ))}
            </div>
          </SubHeading>
        )}

        {entityExtensions.length > 0 && (
          <SubHeading label="Extends" count={entityExtensions.length}>
            <div className="flex flex-col gap-0.5">
              {entityExtensions.map((e) => (
                <div
                  key={e.tableName}
                  className="flex items-center gap-2 px-2 py-0.5 text-xs"
                >
                  <PluginLink name={e.parentPlugin} label={asPath(e.parentPlugin)} />
                  <code className="min-w-0 truncate font-mono text-muted-foreground">
                    {e.tableName}
                  </code>
                </div>
              ))}
            </div>
          </SubHeading>
        )}

        {extendedBy.length > 0 && (
          <SubHeading label="Extended by" count={extendedBy.length}>
            <div className="flex flex-col gap-0.5">
              {extendedBy.map((e) => (
                <div
                  key={e.tableName}
                  className="flex items-center gap-2 px-2 py-0.5 text-xs"
                >
                  <PluginLink name={e.childPlugin} label={asPath(e.childPlugin)} />
                  <code className="min-w-0 truncate font-mono text-muted-foreground">
                    {e.tableName}
                  </code>
                </div>
              ))}
            </div>
          </SubHeading>
        )}
      </div>
    </Section>
  );
}
