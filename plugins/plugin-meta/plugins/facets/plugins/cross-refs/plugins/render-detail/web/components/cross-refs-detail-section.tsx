import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Section,
  SubHeading,
  PluginLink,
  RUNTIME_COLORS,
  type PluginNode,
  type ExportRuntime,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { CrossRefsData } from "@plugins/plugin-meta/plugins/facets/plugins/cross-refs/core";

// Renders the cross-refs facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const CROSS_REFS_FACET_ID = "cross-refs";

const RUNTIMES: ExportRuntime[] = ["web", "server", "central", "core", "shared"];

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
      <div className="flex flex-col gap-3">
        {importedBy.length > 0 && <ImportedByBanner names={importedBy} />}
        {totalUses > 0 && (
          <SubHeading label="Uses" count={totalUses}>
            <div className="flex flex-col gap-2">
              {RUNTIMES.map((rt) =>
                apiUses[rt].length > 0 ? (
                  <UsesGroup key={rt} runtime={rt} uses={apiUses[rt]} />
                ) : null,
              )}
            </div>
          </SubHeading>
        )}
      </div>
    </Section>
  );
}

// ── Per-runtime uses group ──────────────────────────────────────────

function UsesGroup({
  runtime,
  uses,
}: {
  runtime: ExportRuntime;
  uses: string[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 px-2 text-xs">
        <span className={cn("font-mono font-medium", RUNTIME_COLORS[runtime])}>
          {runtime}
        </span>
        <span className="text-muted-foreground/50">({uses.length})</span>
      </div>
      <div className="ml-1 flex flex-col gap-px border-l border-border/50 pl-3">
        {uses.map((u) => (
          <code
            key={u}
            className="truncate px-1.5 py-px font-mono text-xs text-foreground"
          >
            {u}
          </code>
        ))}
      </div>
    </div>
  );
}

// ── Imported-by banner (ported from public-api-section.tsx) ──────────

function ImportedByBanner({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const threshold = 4;
  const visible = expanded ? names : names.slice(0, threshold);
  const remaining = names.length - threshold;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-3xs text-muted-foreground">
      <span className="mr-0.5 font-medium">Imported by</span>
      {visible.map((name, i) => (
        <span key={name} className="inline-flex items-center">
          <PluginLink name={name} />
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
