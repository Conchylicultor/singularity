import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import {
  Section,
  SubHeading,
  PluginLink,
  RUNTIME_COLORS,
  type PluginNode,
  type ExportRuntime,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  RUNTIME_FOLDERS,
  asPath,
  type PluginId,
} from "@plugins/framework/plugins/plugin-id/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type {
  CrossRefsData,
  ApiUse,
} from "@plugins/plugin-meta/plugins/facets/plugins/cross-refs/core";

// Renders the cross-refs facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const CROSS_REFS_FACET_ID = "cross-refs";

const RUNTIMES = RUNTIME_FOLDERS;

export function CrossRefsDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[CROSS_REFS_FACET_ID] as CrossRefsData | undefined;
  if (!data) return null;

  const { apiUses, importedBy } = data;
  const totalUses = RUNTIMES.reduce((sum, rt) => sum + apiUses[rt].length, 0);
  if (totalUses === 0 && importedBy.length === 0) return null;

  const parts: string[] = [];
  if (totalUses > 0) parts.push(`${totalUses} use${totalUses !== 1 ? "s" : ""}`);
  if (importedBy.length > 0)
    parts.push(
      `${importedBy.length} importer${importedBy.length !== 1 ? "s" : ""}`,
    );

  return (
    <Section title="Cross-refs" count={parts.join(" · ")}>
      <Stack gap="md">
        {importedBy.length > 0 && <ImportedByBanner names={importedBy} />}
        {totalUses > 0 && (
          <SubHeading label="Uses" count={totalUses}>
            <Stack gap="sm">
              {RUNTIMES.map((rt) =>
                apiUses[rt].length > 0 ? (
                  <UsesGroup key={rt} runtime={rt} uses={apiUses[rt]} />
                ) : null,
              )}
            </Stack>
          </SubHeading>
        )}
      </Stack>
    </Section>
  );
}

// ── Per-runtime uses group ──────────────────────────────────────────

function UsesGroup({
  runtime,
  uses,
}: {
  runtime: ExportRuntime;
  uses: ApiUse[];
}) {
  return (
    <Stack gap="2xs">
      <Text as="div" variant="caption" className="flex items-center gap-xs px-sm">
        <span className={cn("font-mono font-medium", RUNTIME_COLORS[runtime])}>
          {runtime}
        </span>
        <span className="text-muted-foreground/50">({uses.length})</span>
      </Text>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- ml-1 indents this nested tree branch under its runtime header; one-off left offset paired with the left border, not sibling rhythm */}
      <div className="ml-1 flex flex-col gap-px border-l border-border/50 pl-md">
        {uses.map((u) => (
          <Text
            as="code"
            variant="caption"
            key={`${u.plugin}:${u.symbol ?? ""}`}
            className="truncate px-xs py-px font-mono text-foreground"
          >
            {asPath(u.plugin)}
            {u.symbol ? "." + u.symbol : ""}
          </Text>
        ))}
      </div>
    </Stack>
  );
}

// ── Imported-by banner (ported from public-api-section.tsx) ──────────

function ImportedByBanner({ names }: { names: PluginId[] }) {
  const [expanded, setExpanded] = useState(false);
  const threshold = 4;
  const visible = expanded ? names : names.slice(0, threshold);
  const remaining = names.length - threshold;

  return (
    <div className="flex flex-wrap items-center gap-x-xs gap-y-2xs text-3xs text-muted-foreground">
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mr-0.5 is a tiny inline trailing offset on the leading label before the wrapped chip flow, not container rhythm */}
      <span className="mr-0.5 font-medium">Imported by</span>
      {visible.map((name, i) => (
        <span key={name} className="inline-flex items-center">
          <PluginLink name={name} label={asPath(name)} />
          {i < visible.length - 1 && (
            <span className="text-muted-foreground/40">,</span>
          )}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          className="text-muted-foreground/60 hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          +{remaining} more
        </button>
      )}
    </div>
  );
}
