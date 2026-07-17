import type { ReactElement } from "react";
import { MdPlayArrow, MdStop, MdOpenInNew } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  previewEndpoint,
  stopPreviewEndpoint,
  releaseRunResource,
  previewStateResource,
} from "@plugins/release/core";

export function ReleaseArtifact({ runId }: { runId: string }): ReactElement {
  const runResult = useResource(releaseRunResource, { id: runId });
  const previewResult = useResource(previewStateResource);

  const startPreview = useEndpointMutation(previewEndpoint);
  const stopPreview = useEndpointMutation(stopPreviewEndpoint);

  if (runResult.pending || previewResult.pending) return <Loading />;

  const run = runResult.data;
  if (!run) {
    return (
      <Text as="p" variant="caption" className="text-muted-foreground">
        Run not found
      </Text>
    );
  }

  const preview = previewResult.data[runId];
  const isPreviewRunning = preview?.status === "running";
  const canPreview = run.status === "succeeded" && !isPreviewRunning;

  return (
    <Stack gap="md">
      <Stack gap="2xs">
        <Text as="span" variant="caption" className="text-muted-foreground">
          Artifact
        </Text>
        {run.artifactPath ? (
          // eslint-disable-next-line text/no-adhoc-typography -- mono filesystem path, intentional inline-code size
          <code className="font-mono text-xs break-all">{run.artifactPath}</code>
        ) : (
          <Text as="span" variant="body" className="text-muted-foreground">
            No artifact yet
          </Text>
        )}
      </Stack>

      <Cluster gap="sm">
        {isPreviewRunning ? (
          <Button
            variant="outline"
            loading={stopPreview.isPending}
            onClick={() => stopPreview.mutate({ params: { id: runId } })}
          >
            <MdStop className="size-4" />
            Stop preview
          </Button>
        ) : (
          <Button
            variant="default"
            loading={startPreview.isPending}
            disabled={!canPreview}
            onClick={() => startPreview.mutate({ params: { id: runId } })}
          >
            <MdPlayArrow className="size-4" />
            Preview
          </Button>
        )}

        {isPreviewRunning && preview && (
          <LinkChip
            mono
            leading={<MdOpenInNew />}
            title="Open preview in a new tab"
            onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}
          >
            {preview.url}
          </LinkChip>
        )}
      </Cluster>
    </Stack>
  );
}
