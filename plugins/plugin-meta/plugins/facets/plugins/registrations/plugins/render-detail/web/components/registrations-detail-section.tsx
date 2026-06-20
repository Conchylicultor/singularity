import {
  Section,
  RUNTIME_COLORS,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { DocMetaRegistration } from "@plugins/plugin-meta/plugins/facets/plugins/registrations/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

// Renders the registrations facet's own data. Read `node.facets[id]` directly
// (as every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const REGISTRATIONS_FACET_ID = "registrations";

function format(r: DocMetaRegistration): string {
  if (!r.factory) return r.doc.label ?? r.kind;
  return r.doc.label ? `${r.factory}('${r.doc.label}')` : `${r.factory}()`;
}

export function RegistrationsDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[REGISTRATIONS_FACET_ID] as
    | DocMetaRegistration[]
    | undefined;
  if (!data || data.length === 0) return null;

  return (
    <Section title="Registrations" count={String(data.length)}>
      <Stack gap="2xs">
        {data.map((r, i) => (
          <Frame
            key={`${r.runtime}:${r.kind}:${i}`}
            className="text-caption px-sm py-2xs"
            content={
              <Text as="code" className="font-mono text-foreground">
                {format(r)}
              </Text>
            }
            trailing={
              <span className={`font-mono text-3xs ${RUNTIME_COLORS[r.runtime]}`}>
                {r.runtime}
              </span>
            }
          />
        ))}
      </Stack>
    </Section>
  );
}
