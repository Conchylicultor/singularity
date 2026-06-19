import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TextDiff } from "@plugins/primitives/plugins/diff-view/web";
import { getConfigRawFile } from "../../core";

// Side-by-side diff of the user's override (left) vs the upstream defaults
// (right). During a conflict the on-disk `origin` holds the new upstream
// defaults while `override` holds the user's stale config.
export function ConflictDiff({ storePath }: { storePath: string }) {
  const { data, isPending } = useEndpoint(getConfigRawFile, {}, {
    query: { storePath },
  });

  if (isPending) return <Loading label="Loading diff…" />;
  if (!data) return <Placeholder>No data</Placeholder>;

  const override = data.override ?? "";
  const origin = data.origin ?? "";

  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- mb-2 separates the diff block from the following content
    <Clip className="mb-2 rounded-md border border-border">
      <Text as="div" variant="caption" tone="muted" className="border-b border-border bg-muted/40 px-md py-xs font-medium">
        <Stack direction="row" align="center" justify="between" gap="none">
          <span>Your config</span>
          <span>Upstream defaults</span>
        </Stack>
      </Text>
      <Scroll axis="both" className="max-h-96">
        {override === origin ? (
          <Placeholder>No differences in the raw files.</Placeholder>
        ) : (
          <TextDiff oldText={override} newText={origin} path="config.json" />
        )}
      </Scroll>
    </Clip>
  );
}
