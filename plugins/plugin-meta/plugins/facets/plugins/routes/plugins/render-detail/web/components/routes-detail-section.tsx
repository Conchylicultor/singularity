import { useState } from "react";
import { cn } from "@/lib/utils";
import { Text } from "@plugins/primitives/plugins/text/web";
import {
  Section,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type {
  RoutesData,
  RouteDef,
} from "@plugins/plugin-meta/plugins/facets/plugins/routes/core";

// Renders the routes facet's own data. Read `node.facets[id]` directly (as every
// render host does) rather than importing the build-time `facets/core` barrel,
// which would drag `loadFacets` + `fs`/`path` into the browser bundle. The
// type-only import from the facet core is erased and safe.
const ROUTES_FACET_ID = "routes";

// Ported from public-api-section.tsx's RoutesGroup. The facet stores the method
// inside the route string for HTTP routes ("GET /api/foo") and carries
// type === "ws" for WS routes, which have no method prefix.
const METHOD_COLORS: Record<string, string> = {
  GET: "text-categorical-2",
  POST: "text-categorical-1",
  PUT: "text-categorical-3",
  PATCH: "text-categorical-3",
  DELETE: "text-categorical-4",
  WS: "text-categorical-5",
};

function methodAndPath(r: RouteDef): { method: string; path: string } {
  if (r.type === "ws") return { method: "WS", path: r.route };
  const spaceIdx = r.route.indexOf(" ");
  if (spaceIdx < 0) return { method: "", path: r.route };
  return {
    method: r.route.slice(0, spaceIdx),
    path: r.route.slice(spaceIdx + 1),
  };
}

export function RoutesDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[ROUTES_FACET_ID] as RoutesData | undefined;
  if (!data) return null;

  const { routes, endpointCallers } = data;
  if (routes.length === 0 && endpointCallers.length === 0) return null;

  const parts: string[] = [];
  if (routes.length > 0)
    parts.push(`${routes.length} route${routes.length !== 1 ? "s" : ""}`);
  if (endpointCallers.length > 0)
    parts.push(
      `${endpointCallers.length} caller${endpointCallers.length !== 1 ? "s" : ""}`,
    );

  return (
    <Section title="Routes" count={parts.join(" · ")}>
      <div className="flex flex-col gap-3">
        {endpointCallers.length > 0 && <CallersBanner names={endpointCallers} />}
        {routes.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {routes.map((r) => {
              const { method, path } = methodAndPath(r);
              return (
                <Text
                  as="div"
                  variant="caption"
                  key={`${r.runtime}:${r.type}:${r.route}`}
                  className="flex items-center gap-2 px-2 py-0.5"
                >
                  {method && (
                    <span
                      className={cn(
                        "w-10 shrink-0 font-mono text-3xs font-semibold",
                        METHOD_COLORS[method] ?? "text-muted-foreground",
                      )}
                    >
                      {method}
                    </span>
                  )}
                  <code className="min-w-0 truncate font-mono text-foreground">
                    {path}
                  </code>
                  <span className="ml-auto shrink-0 text-3xs text-muted-foreground/50">
                    {r.runtime}
                  </span>
                </Text>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Endpoint-callers banner (mirrors cross-refs' ImportedByBanner) ───

function CallersBanner({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const threshold = 4;
  const visible = expanded ? names : names.slice(0, threshold);
  const remaining = names.length - threshold;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-3xs text-muted-foreground">
      <span className="mr-0.5 font-medium">Endpoint callers</span>
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
