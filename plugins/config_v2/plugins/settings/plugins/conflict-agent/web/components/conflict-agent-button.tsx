import { MdAutoAwesome } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import type { ConfigConflictContext } from "@plugins/config_v2/plugins/settings/web";
import {
  buildConflictPrompt,
  describeConflict,
} from "../internal/build-prompt";

/**
 * "Ask an agent" inside a config conflict banner: the standard launch popover,
 * with the conflict already written out as the agent's first turn. The user
 * reads what the agent is being handed, types any extra context, picks the
 * model, and launches — same surface as the crash Fix and build-failure
 * buttons, so "launch an agent about this" looks the same everywhere.
 *
 * The launch is fire-and-forget: the conversation runs in the background and
 * the toast is what carries the user to it.
 */
export function ConflictAgentButton({
  conflict,
}: {
  conflict: ConfigConflictContext;
}) {
  return (
    <LaunchAgentPopover
      trigger={
        <Button variant="ghost" className={conflict.actionClassName}>
          <MdAutoAwesome className="size-3.5" />
          Ask an agent
        </Button>
      }
      title="Resolve this config conflict"
      description={describeConflict(conflict)}
      placeholder="Extra context (optional) — e.g. why you set these values…"
      align="end"
      onLaunched={(conv) => {
        toast({
          type: "config",
          title: "Resolving config conflict",
          description:
            "Agent launched in the background — open it from here or the bell.",
          variant: "info",
          linkTo: conversationRoute.link(agentManagerApp, {
            convId: conv.id,
          }),
        });
      }}
      getRequest={(userText) => {
        const extra = userText.trim();
        const prompt = extra
          ? `${buildConflictPrompt(conflict)}\n\n## Context\n\n${extra}`
          : buildConflictPrompt(conflict);
        return { prompt };
      }}
    />
  );
}
