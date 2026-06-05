import {
  Section,
  ConsumerList,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  contributionId,
  type ContributionsFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";

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

  const { static: contribs, slotContributors } = data;
  if (contribs.length === 0 && slotContributors.length === 0) return null;

  return (
    <Section
      title="Contributions"
      count={`${contribs.length} contribution${contribs.length !== 1 ? "s" : ""}`}
    >
      {contribs.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {contribs.map((c, i) => {
            const id = contributionId(c);
            return (
              <div
                key={`${c.slot}:${id ?? i}`}
                className="flex items-center gap-2 px-2 py-0.5 text-xs"
              >
                <code className="font-mono text-foreground">{c.slot}</code>
                {id && (
                  <code className="ml-auto truncate font-mono text-muted-foreground/60">
                    {id}
                  </code>
                )}
              </div>
            );
          })}
        </div>
      )}
      {slotContributors.length > 0 && (
        <div className="mt-2 flex items-center gap-2 px-2 py-0.5 text-xs">
          <span className="shrink-0 text-muted-foreground/60">
            Slot contributors
          </span>
          <ConsumerList names={slotContributors} />
        </div>
      )}
    </Section>
  );
}
