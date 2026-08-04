import type { ReactNode } from "react";
import { MdBuild, MdCloudUpload } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { LiveLogChannel } from "@plugins/primitives/plugins/log-channels/web";
import {
  useActiveViewId,
  ViewSwitcher,
} from "@plugins/primitives/plugins/view-switcher/web";
import { DEPLOY_LOG_CHANNEL } from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { RELEASE_LOG_CHANNEL } from "@plugins/release/core";

/**
 * The two channels this pipeline drives, with the caption each one needs.
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

const STORAGE_KEY = "deploy.release-pipeline.output";

export function OutputSection(): ReactNode {
  const { activeViewId, setActiveView } = useActiveViewId(STORAGE_KEY);
  const active =
    CHANNELS.find((c) => c.id === activeViewId) ?? CHANNELS[0];

  return (
    <Stack gap="xs">
      <ViewSwitcher
        options={CHANNELS.map((c) => ({ id: c.id, title: c.title, icon: c.icon }))}
        activeId={active.id}
        onSelect={setActiveView}
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
