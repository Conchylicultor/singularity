import { MdAutoAwesome } from "react-icons/md";
import { LaunchAgentPopover } from "@plugins/primitives/plugins/launch/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { conversationRoute } from "@plugins/conversations/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";

export function InvestigateEventButton({
  label,
  json,
  sourceConversationId,
  className,
}: {
  label: string;
  json: unknown;
  sourceConversationId: string | null;
  className?: string;
}) {
  return (
    <LaunchAgentPopover
      align="end"
      title="Investigate event"
      description={`Launch an agent with this ${label} event as context.`}
      placeholder="Extra context (optional) — what you want the agent to do…"
      trigger={
        <button
          type="button"
          aria-label="Launch agent to investigate"
          title="Launch agent to investigate this event"
          className={`rounded-md p-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${className ?? ""}`}
        >
          <Center>
            <MdAutoAwesome className="size-3.5" />
          </Center>
        </button>
      }
      onLaunched={(conv) => {
        toast({
          type: "investigate",
          title: "Investigating event",
          description: "Agent launched in the background — open it from here or the bell.",
          variant: "info",
          linkTo: conversationRoute.link(agentManagerApp, { convId: conv.id }),
        });
      }}
      getRequest={(userText) => {
        const body = userText.trim();
        const prompt = [
          "## Investigate JSONL event",
          "",
          "The conversation viewer fell back to a generic renderer for this event because it isn't specially handled.",
          "",
          `**Event type:** \`${label}\``,
          `**Source conversation:** \`${sourceConversationId ?? "unknown"}\``,
          "",
          "```json",
          JSON.stringify(json, null, 2),
          "```",
          ...(body ? ["", "## Context", "", body] : []),
        ].join("\n");
        return { prompt };
      }}
    />
  );
}
