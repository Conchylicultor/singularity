import type { ReactNode } from "react";
import { MdRocketLaunch } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Step, StepNote, Steps, type StepState } from "@plugins/primitives/plugins/setup-steps/web";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useServerHealth } from "@plugins/apps/plugins/deploy/plugins/health/web";
import { useBlockedReason } from "@plugins/apps/plugins/deploy/plugins/deployments/web";
import {
  deploymentsResource,
  deployRunsResource,
  loopbackOnlySentence,
  publicUrls,
  runDeployment,
  type Deployment,
  type DeployPhase,
  type DeployRun,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import type { PlatformTag } from "@plugins/release/core";
import { bundleRefusalMessage } from "@plugins/release/plugins/bundles/core";
import { shortSha, stalenessChipLabel, stalenessSentence } from "../../core";
import { useReleaseInfo, type ReleaseInfo } from "../internal/use-release-info";

/**
 * The three legs of an `update`, in the order they run — the same closed list
 * `DeployPhase` names, spelled once here for the report.
 */
const PHASES: ReadonlyArray<{ id: DeployPhase; title: string }> = [
  { id: "converge", title: "Converge the host" },
  { id: "build", title: "Build the candidate" },
  { id: "ship", title: "Ship it" },
];

/**
 * **Deploy to server** — one button, and everything needed to trust pressing it.
 *
 * The four-step pipeline this replaces was a faithful rendering of a real
 * constraint chain (ship refuses on an un-converged host, and refuses without a
 * packed, platform-matched bundle). The chain did not go away — it became the
 * phases of ONE run, sequenced server-side and *reported* here. The two facts
 * that made that safe: converge is genuinely a no-op the second time, and
 * `resolveBundle` + `compareToHead` already answer "do I need to build?" without
 * asking anyone.
 *
 * The two resources are gated together, so this can never paint from a
 * half-loaded snapshot.
 */
export function RemoteDeploySection({ deploymentId }: { deploymentId: string }): ReactNode {
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
      return <RemoteDeploy deployment={deployment} run={runs[deployment.id]} />;
    },
  });
}

function RemoteDeploy({
  deployment,
  run,
}: {
  deployment: Deployment;
  run: DeployRun | undefined;
}): ReactNode {
  // The same hook the row's Converge / Ship buttons gate on, so a tooltip and
  // this button can never disagree about why something is blocked.
  const blocked = useBlockedReason(deployment);
  const health = useServerHealth(deployment.serverId);
  // Never a picker: the platform a deploy needs is DISCOVERED by the probe, and
  // a field with a default is a field someone sets back to the wrong value. The
  // orchestrator reads the same fact server-side; this copy only labels.
  const platform: PlatformTag | null = (health?.ok && health.platform) || null;
  const info = useReleaseInfo(deployment.compositionId, platform);

  const deploy = useEndpointMutation(runDeployment);
  const urls = publicUrls(deployment.hostnames);

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Button
          className="w-fit"
          disabled={blocked !== null}
          title={blocked ?? undefined}
          loading={deploy.isPending}
          onClick={() =>
            deploy.mutate({ params: { id: deployment.id }, body: { verb: "update" } })
          }
        >
          <MdRocketLaunch />
          {platform ? `Deploy ${platform}` : "Deploy"}
        </Button>
        <Text as="p" variant="caption" tone="muted">
          Converges the host, builds a {platform ?? "matching"} candidate unless one is
          already current, then ships that exact run behind the CLI&apos;s remote health
          gate.
        </Text>
        {blocked && (
          <Text as="p" variant="caption" tone="destructive">
            {blocked}
          </Text>
        )}
      </Stack>

      {/* Rendered for the whole life of an update — including after it ends —
          because "which leg did it fail on" is the first thing anyone asks, and
          a strip that vanished on failure would answer it by hiding. */}
      {run?.verb === "update" && <PhaseReport run={run} />}

      <Provenance info={info} />

      <Stack gap="2xs">
        <Text as="span" variant="label">
          Inspect the deployed app
        </Text>
        {urls.length > 0 ? (
          <Cluster gap="xs">
            {urls.map((url) => (
              <LinkChip
                key={url}
                mono
                title={`Open ${url}`}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(url, "_blank", "noopener");
                }}
              >
                {url}
              </LinkChip>
            ))}
          </Cluster>
        ) : (
          <Text as="p" variant="caption" tone="muted">
            {loopbackOnlySentence(deployment.loopbackPort)}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

/**
 * Where the running (or last) update got to — a REPORT, not a set of controls.
 *
 * `Steps`/`Step` is reused for exactly the state vocabulary it already carries
 * (done shows a check; upcoming dims AND marks the step inert), which is what a
 * progress strip wants and what a hand-rolled row of dots would have to
 * re-derive. Nothing inside a step is clickable — the sequence is the server's.
 */
function PhaseReport({ run }: { run: DeployRun }): ReactNode {
  const currentIndex = PHASES.findIndex((p) => p.id === run.phase);
  const failed = run.status === "failed";

  return (
    <Stack gap="xs">
      <Steps>
        {PHASES.map((phase, i) => (
          <Step key={phase.id} title={phase.title} state={stateOf(i, currentIndex, run.status)}>
            {i === currentIndex && failed && run.message && (
              <Text as="p" variant="caption" tone="destructive" className="whitespace-pre-wrap">
                {run.message}
              </Text>
            )}
          </Step>
        ))}
      </Steps>
      {run.status === "succeeded" && (
        <Text as="p" variant="caption" tone="muted">
          Shipped {run.release ?? "the resolved bundle"}
          {run.finishedAt && (
            <>
              {" — "}
              <RelativeTime date={new Date(run.finishedAt)} />
            </>
          )}
          .
        </Text>
      )}
    </Stack>
  );
}

/**
 * A phase's position relative to the one the run is on. A finished run leaves
 * `phase` at the leg it ended on, so a success marks every phase done while a
 * failure leaves the failing leg `active` — which is where its message is.
 */
function stateOf(index: number, currentIndex: number, status: DeployRun["status"]): StepState {
  if (status === "succeeded") return "done";
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "active";
  return "upcoming";
}

/**
 * What Deploy would send, and how it relates to the source — rendered ALWAYS, in
 * every state, because "you tested X, you are shipping X" is the one question
 * this pane exists to answer and a silent surface answers it by implication.
 *
 * When there is no bundle, the CLI's own refusal is shown verbatim:
 * `resolveBundle` is the authority on shippability and this UI never re-derives
 * it, so the sentence a user reads here is the sentence `ship` would print. It
 * is NOT a blocker for the button — Deploy builds one — but it is what the
 * button would have to start from.
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
          Nothing built yet — Deploy will build it
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
      <Text as="span" variant="label">
        What is built for this server
      </Text>
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
        {stalenessSentence(staleness)}{" "}
        {staleness.kind === "current"
          ? "Deploy will reuse it rather than recompiling."
          : "Deploy will rebuild before shipping."}
      </Text>
    </Stack>
  );
}
