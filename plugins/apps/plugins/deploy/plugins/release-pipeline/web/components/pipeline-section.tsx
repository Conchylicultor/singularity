import type { ReactNode } from "react";
import { MdBuild, MdRocketLaunch, MdScience, MdTune } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { LiveLogChannel } from "@plugins/primitives/plugins/log-channels/web";
import { openDialog } from "@plugins/primitives/plugins/imperative-dialog/web";
import {
  Step,
  StepNote,
  Steps,
  type StepState,
} from "@plugins/primitives/plugins/setup-steps/web";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { EndpointError, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useServerHealth } from "@plugins/apps/plugins/deploy/plugins/health/web";
import { useBlockedReason } from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import {
  deploymentsResource,
  deployRunsResource,
  runDeployment,
  type Deployment,
  type DeployRun,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import {
  RELEASE_LOG_CHANNEL,
  triggerReleaseEndpoint,
  type PlatformTag,
} from "@plugins/release/core";
import { bundleRefusalMessage } from "@plugins/release/plugins/bundles/core";
import {
  NEVER_REHEARSED_SENTENCE,
  REHEARSAL_LIMIT_NOTE,
  shortSha,
  stalenessChipLabel,
  stalenessSentence,
} from "../../core";
import { useReleaseInfo, type ReleaseInfo } from "../internal/use-release-info";
import { ShipConfirmDialog } from "./ship-confirm-dialog";

/**
 * Converge → Build → Rehearse → Ship for one deployment.
 *
 * The four steps are a closed, ordered list — plain data, not a slot — because
 * the *gating between them* is the content: an `upcoming` step renders dimmed
 * AND inert (pointer- and Tab-unreachable), so a step you may not act on yet is
 * structurally unreachable rather than a pile of `disabled` props that someone
 * eventually forgets.
 *
 * The two resources are gated together, so the pipeline can never paint from a
 * half-loaded snapshot: a deployment whose run state had not arrived would show
 * Converge as never-run, which is exactly the wrong-state-while-loading bug.
 */
export function PipelineSection({ deploymentId }: { deploymentId: string }): ReactNode {
  const loaded = useCombinedResources({
    deployments: useResource(deploymentsResource),
    runs: useResource(deployRunsResource),
  });

  return matchResource(loaded, {
    pending: () => <Loading variant="rows" />,
    error: () => <Loading variant="rows" />,
    ready: ({ deployments, runs }) => {
      const deployment = deployments.find((d) => d.id === deploymentId);
      if (!deployment) {
        return <Placeholder tone="error">This deployment no longer exists.</Placeholder>;
      }
      return <Pipeline deployment={deployment} lastRun={runs[deployment.id]} />;
    },
  });
}

function Pipeline({
  deployment,
  lastRun,
}: {
  deployment: Deployment;
  lastRun: DeployRun | undefined;
}): ReactNode {
  // The same hook the row's Converge / Ship buttons gate on, so a tooltip and a
  // step can never disagree about why something is blocked.
  const blocked = useBlockedReason(deployment);
  const health = useServerHealth(deployment.serverId);
  // Never a picker: the platform a deploy needs is DISCOVERED by the probe, and
  // a field with a default is a field someone sets back to the wrong value.
  const platform: PlatformTag | null = (health?.ok && health.platform) || null;
  const info = useReleaseInfo(deployment.compositionId, platform);

  const deploy = useEndpointMutation(runDeployment);
  const build = useEndpointMutation(triggerReleaseEndpoint);

  const building = info.latestRun?.status === "running";
  const buildBlocked =
    blocked ?? (building ? `A build of "${deployment.compositionId}" is already running.` : null);
  const bundle = info.candidate?.resolution.ok === true ? info.candidate.resolution : null;

  const convergedOnce = lastRun?.verb === "converge" && lastRun.status === "succeeded";
  const gate = (open: boolean): StepState => (open ? "active" : "upcoming");

  return (
    <Steps>
      <Step
        title="Converge the host"
        state={blocked !== null ? "upcoming" : convergedOnce ? "done" : "active"}
      >
        <StepNote>
          Installs the run user, the dir layout, <code>env</code>, the Caddy site,
          the systemd unit and the firewall. Idempotent — re-run it any time to
          repair drift.
        </StepNote>
        <StepNote>
          Runs are only remembered since the last backend restart, so a blank
          history here means &ldquo;not since this boot&rdquo;, never &ldquo;never&rdquo;.
        </StepNote>
        {blocked && <BlockedNote reason={blocked} />}
        <Button
          variant="outline"
          className="w-fit"
          loading={deploy.isPending}
          onClick={() =>
            deploy.mutate({ params: { id: deployment.id }, body: { verb: "converge" } })
          }
        >
          <MdTune />
          Converge
        </Button>
      </Step>

      <Step
        title={platform ? `Build for ${platform}` : "Build a candidate"}
        state={buildBlocked !== null ? "upcoming" : bundle ? "done" : "active"}
      >
        <StepNote>
          Cuts a packed <code>{platform ?? "…"}</code> release of{" "}
          <code>{deployment.compositionId}</code> — the only kind of run{" "}
          <code>ship</code> can pick up.
        </StepNote>
        {buildBlocked && <BlockedNote reason={buildBlocked} />}
        <Button
          variant="outline"
          className="w-fit"
          loading={build.isPending}
          onClick={() => {
            if (!platform) return;
            build.mutate({
              body: {
                composition: deployment.compositionId,
                target: "web",
                intent: { kind: "candidate", platform },
              },
            });
          }}
        >
          <MdBuild />
          {platform ? `Build for ${platform}` : "Build"}
        </Button>
        {/* The CLI has no progress protocol — the log IS the progress. */}
        {building && (
          <LiveLogChannel
            channel={RELEASE_LOG_CHANNEL}
            label="Build"
            emptyState="Waiting for the build to say something…"
            className="max-h-64"
          />
        )}
        {info.latestRun?.status === "failed" && (
          <Stack gap="2xs">
            <Text as="p" variant="label" tone="destructive">
              The last build of {info.latestRun.composition} failed
              {info.latestRun.exitCode === null
                ? " before it started"
                : ` (exit ${info.latestRun.exitCode})`}
              {info.latestRun.finishedAt && (
                <>
                  {" — "}
                  <RelativeTime date={new Date(info.latestRun.finishedAt)} />
                </>
              )}
            </Text>
            {info.latestRun.error && (
              <Text
                as="p"
                variant="caption"
                tone="destructive"
                className="whitespace-pre-wrap"
              >
                {info.latestRun.error}
              </Text>
            )}
          </Stack>
        )}
      </Step>

      {/* P3. Rendered — and inert — rather than hidden: the pipeline has four
          steps whether or not this one works yet, and a missing step would make
          Ship look like the step after Build. */}
      <Step title="Rehearse" state="upcoming">
        <StepNote>
          Rehearsing boots this composition&apos;s served namespace at{" "}
          <code>http://{deployment.compositionId}.localhost:9000</code> and checks
          that it comes up. {REHEARSAL_LIMIT_NOTE}
        </StepNote>
        <StepNote>Not available yet.</StepNote>
        <Button variant="outline" className="w-fit" disabled>
          <MdScience />
          Rehearse
        </Button>
      </Step>

      <Step
        title={platform ? `Ship ${platform} bundle` : "Ship the bundle"}
        state={gate(buildBlocked === null && bundle !== null)}
      >
        <Provenance info={info} />
        {bundle && (
          <Button
            variant="outline"
            className="w-fit text-destructive hover:text-destructive"
            loading={deploy.isPending}
            onClick={() => {
              // Fire-and-forget: awaiting `openDialog` would pend the button for
              // the dialog's whole open lifetime rather than the ship's.
              void openDialog((close) => (
                <ShipConfirmDialog
                  composition={deployment.compositionId}
                  runId={bundle.runId}
                  onCancel={close}
                  onConfirm={() =>
                    deploy
                      .mutateAsync({
                        params: { id: deployment.id },
                        // Pinned by run id: what was inspected here is what goes
                        // out, not whatever `latest-<platform>` points at by then.
                        body: { verb: "ship", release: bundle.runId },
                      })
                      .then(() => close())
                      .catch((err: unknown) => {
                        // Expected failure — the global toast already reported
                        // it; keep the dialog open so the user can retry.
                        if (err instanceof EndpointError) return;
                        throw err;
                      })
                  }
                />
              ));
            }}
          >
            <MdRocketLaunch />
            Ship without rehearsing
          </Button>
        )}
      </Step>
    </Steps>
  );
}

function BlockedNote({ reason }: { reason: string }): ReactNode {
  return (
    <Text as="p" variant="caption" tone="destructive">
      {reason}
    </Text>
  );
}

/**
 * What Ship would send, and how it relates to the source — rendered ALWAYS, in
 * every state, because "you tested X, you are shipping X" is the one question
 * this pane exists to answer and a silent surface answers it by implication.
 *
 * When there is no bundle, the CLI's own refusal is shown verbatim:
 * `resolveBundle` is the authority on shippability and this UI never re-derives
 * it, so the sentence a user reads here is the sentence `ship` would print.
 */
function Provenance({ info }: { info: ReleaseInfo }): ReactNode {
  if (info.pending || !info.candidate) {
    return (
      <StepNote>
        No verified platform for this server yet, so there is no candidate to
        resolve.
      </StepNote>
    );
  }

  const { resolution, staleness } = info.candidate;

  if (!resolution.ok) {
    return (
      <Stack gap="2xs">
        <Text as="p" variant="label">
          Nothing to ship
        </Text>
        <Text as="p" variant="caption" tone="muted" className="whitespace-pre-wrap">
          {bundleRefusalMessage(resolution.refusal)}
        </Text>
      </Stack>
    );
  }

  const { manifest } = resolution;
  const sha = manifest.commitSha ?? null;

  return (
    <Stack gap="xs">
      <Cluster gap="xs">
        <Badge variant="muted" mono>
          {manifest.platform}
        </Badge>
        <Badge variant="muted" mono title={sha ?? undefined}>
          {sha ? shortSha(sha) : "no commit recorded"}
        </Badge>
        <Badge variant="muted">
          built <RelativeTime date={new Date(manifest.builtAt)} />
        </Badge>
        <Badge variant={staleness.kind === "current" ? "success" : "warning"}>
          {stalenessChipLabel(staleness)}
        </Badge>
      </Cluster>
      <Text as="p" variant="caption" tone="muted">
        {stalenessSentence(staleness)}
      </Text>
      <Text as="p" variant="caption" className="text-warning">
        {NEVER_REHEARSED_SENTENCE}
      </Text>
      <Text as="p" variant="caption" tone="muted">
        {REHEARSAL_LIMIT_NOTE}
      </Text>
    </Stack>
  );
}
