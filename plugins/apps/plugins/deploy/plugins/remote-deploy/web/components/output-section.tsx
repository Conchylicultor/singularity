import { useState, type ReactNode } from "react";
import { MdBuild, MdCloudUpload } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { LiveLogChannel } from "@plugins/primitives/plugins/log-channels/web";
import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  useActiveViewId,
  ViewSwitcher,
} from "@plugins/primitives/plugins/view-switcher/web";
import {
  DEPLOY_LOG_CHANNEL,
  deployRunsResource,
  type DeployRun,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { RELEASE_LOG_CHANNEL } from "@plugins/release/core";

/**
 * The two channels a deploy drives, with the caption each one needs.
 *
 * The asymmetry is real and must be stated rather than implied by placement:
 * `deploy` is the SSH output of one server's converge/ship, while `release` is
 * worktree-scoped and carries every composition's build — including ones this
 * deployment has nothing to do with.
 */
const CHANNELS = [
  {
    id: DEPLOY_LOG_CHANNEL,
    title: "Deploy",
    icon: MdCloudUpload,
    scope: "Converge / ship output for this server. One run at a time — a run is exclusive per server.",
  },
  {
    id: RELEASE_LOG_CHANNEL,
    title: "Build",
    icon: MdBuild,
    scope: "Release builds in this worktree, across ALL compositions — not just this one.",
  },
] as const;

const STORAGE_KEY = "deploy.remote-deploy.output";

/**
 * The channel this deployment's in-flight run is currently writing to, or `null`
 * when this surface has no opinion about which tab to show.
 *
 * `null` is a genuine absence, not a stand-in for a not-yet-loaded value: still
 * loading, no run recorded, and a finished run all mean the same thing to the
 * caller — *fall back to the persisted choice*. There is no state a
 * loaded-but-empty answer would render differently from a pending one, which is
 * the condition under which collapsing them is safe.
 */
function followedChannel(
  runs: ResourceResult<Record<string, DeployRun>>,
  deploymentId: string,
): string | null {
  if (runs.pending) return null;
  const run = runs.data[deploymentId];
  if (run?.status !== "running" || run.phase === null) return null;
  // The middle leg of an `update` writes to a DIFFERENT channel from the two
  // that surround it.
  return run.phase === "build" ? RELEASE_LOG_CHANNEL : DEPLOY_LOG_CHANNEL;
}

/**
 * The deploy pane's log surface: one switcher over the two channels an `update`
 * writes to, with the active tab **following the running phase** until the user
 * picks one by hand.
 *
 * That follow is what makes the one button honest. A fixed tab would go silent
 * for the longest part of the run, and the user would have to know the channel
 * topology to find the output.
 */
export function OutputSection({ deploymentId }: { deploymentId: string }): ReactNode {
  const { activeViewId, setActiveView } = useActiveViewId(STORAGE_KEY);
  // Once the user picks a tab they own the choice for the rest of this mount: a
  // surface that kept yanking the view back would be unusable for anyone
  // deliberately watching the other channel.
  const [userPicked, setUserPicked] = useState(false);

  const followed = followedChannel(useResource(deployRunsResource), deploymentId);
  const activeId = !userPicked && followed !== null ? followed : activeViewId;
  const active = CHANNELS.find((c) => c.id === activeId) ?? CHANNELS[0];

  return (
    <Stack gap="xs">
      <ViewSwitcher
        options={CHANNELS.map((c) => ({ id: c.id, title: c.title, icon: c.icon }))}
        activeId={active.id}
        onSelect={(id) => {
          setUserPicked(true);
          setActiveView(id);
        }}
      />
      <Text as="p" variant="caption" tone="muted">
        {active.scope}
      </Text>
      {/* Keyed on the channel: switching remounts the viewer, which resets its
          buffer and re-subscribes — the previous channel's tail must not linger
          under the new channel's caption. */}
      <LiveLogChannel
        key={active.id}
        channel={active.id}
        emptyState="Nothing on this channel yet."
      />
    </Stack>
  );
}
