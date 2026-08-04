import type { ReactNode } from "react";
import { LiveLogChannel } from "@plugins/primitives/plugins/log-channels/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { DEPLOY_LOG_CHANNEL } from "../../core";

/**
 * Live `converge` / `ship` output — the `deploy` channel through the shared
 * {@link LiveLogChannel} primitive.
 *
 * One panel for the whole server rather than one per deployment, because the
 * channel is one channel: a run is exclusive per server, and each one opens with
 * its own argv line. There is no persisted-fallback branch either — subscribing
 * replays the channel's ring buffer, so the last run's tail is already here when
 * the panel mounts, and the durable JSONL under `logs/deploy.jsonl` is the
 * archive.
 *
 * Mount this only while visible (its host card unmounts the body when collapsed):
 * the subscription is the cost.
 */
export function DeployLogPanel(): ReactNode {
  return (
    <LiveLogChannel
      channel={DEPLOY_LOG_CHANNEL}
      emptyState="No deploy output yet — Converge or Ship a deployment above."
      onError={(error) =>
        toast({
          type: "deploy",
          title: "Deploy log error",
          description: error,
          variant: "error",
        })
      }
    />
  );
}
