import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { TextDiff } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import { getConfigRawFile } from "../../core";

// Side-by-side diff of the user's override (left) vs the upstream defaults
// (right). During a conflict the on-disk `origin` holds the new upstream
// defaults while `override` holds the user's stale config.
export function ConflictDiff({ storePath }: { storePath: string }) {
  const { data, isPending } = useEndpoint(getConfigRawFile, {}, {
    query: { storePath },
  });

  if (isPending) return <Placeholder>Loading diff…</Placeholder>;
  if (!data) return <Placeholder>No data</Placeholder>;

  const override = data.override ?? "";
  const origin = data.origin ?? "";

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        <span>Your config</span>
        <span>Upstream defaults</span>
      </div>
      <div className="max-h-96 overflow-auto">
        {override === origin ? (
          <Placeholder>No differences in the raw files.</Placeholder>
        ) : (
          <TextDiff oldText={override} newText={origin} path="config.json" />
        )}
      </div>
    </div>
  );
}
