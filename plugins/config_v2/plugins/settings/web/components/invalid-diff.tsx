import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { TextDiff } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import { getConfigRawFile } from "../../core";

// Side-by-side diff for an *invalid* conflict: the stored override document that
// is currently in effect (left) vs the schema defaults (right). The invalid data
// can live in any layer — a user override, or (more often) a git override that
// propagated into the user origin — so the "stored" side falls back through the
// layers. The defaults side is the git origin (the generated baseline).
export function InvalidDiff({ storePath }: { storePath: string }) {
  const { data, isPending } = useEndpoint(getConfigRawFile, {}, {
    query: { storePath },
  });

  if (isPending) return <Placeholder>Loading diff…</Placeholder>;
  if (!data) return <Placeholder>No data</Placeholder>;

  const stored = data.override ?? data.gitOverride ?? data.origin ?? "";
  const defaults = data.gitOrigin ?? data.origin ?? "";

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border">
      <Text as="div" variant="caption" tone="muted" className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 font-medium">
        <span>Stored (invalid)</span>
        <span>Defaults</span>
      </Text>
      <div className="max-h-96 overflow-auto">
        {stored === defaults ? (
          <Placeholder>No differences in the raw files.</Placeholder>
        ) : (
          <TextDiff oldText={stored} newText={defaults} path="config.json" />
        )}
      </div>
    </div>
  );
}
