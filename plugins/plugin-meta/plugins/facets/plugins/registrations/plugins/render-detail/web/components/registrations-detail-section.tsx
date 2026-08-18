import {
  SectionCount,
  RUNTIME_COLORS,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { DocMetaRegistration } from "@plugins/plugin-meta/plugins/facets/plugins/registrations/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

// Renders the registrations facet's own data. Read `node.facets[id]` directly
// (as every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const REGISTRATIONS_FACET_ID = "registrations";

function format(r: DocMetaRegistration): string {
  if (!r.factory) return r.doc.label ?? r.kind;
  return r.doc.label ? `${r.factory}('${r.doc.label}')` : `${r.factory}()`;
}

/** The plugin's registrations, or `null` when it registers nothing. */
function registrations(node: PluginNode): DocMetaRegistration[] | null {
  const data = node.facets?.[REGISTRATIONS_FACET_ID] as
    DocMetaRegistration[] | undefined;
  return data && data.length > 0 ? data : null;
}

/** No registrations ⇒ the host paints no card at all. */
export function useRegistrationsAvailable({
  node,
}: {
  node: PluginNode;
}): boolean {
  return registrations(node) !== null;
}

export function RegistrationsCount({ node }: { node: PluginNode }) {
  const data = registrations(node);
  return data ? <SectionCount>{data.length}</SectionCount> : null;
}

export function RegistrationsDetailSection({ node }: { node: PluginNode }) {
  const data = registrations(node);
  if (!data) return null;

  return (
    <Stack gap="2xs">
      {data.map((r, i) => (
        <Text
          as={Line}
          variant="caption"
          key={`${r.runtime}:${r.kind}:${i}`}
          className="gap-sm px-sm py-2xs"
        >
          <Text as="code" className="font-mono text-foreground">
            {format(r)}
          </Text>
          {/* An empty Fill absorbs the slack, so the runtime tag sits flush right. */}
          <Fill />
          <span
            className={cn(
              rigidClass(),
              "font-mono text-3xs",
              RUNTIME_COLORS[r.runtime],
            )}
          >
            {r.runtime}
          </span>
        </Text>
      ))}
    </Stack>
  );
}
