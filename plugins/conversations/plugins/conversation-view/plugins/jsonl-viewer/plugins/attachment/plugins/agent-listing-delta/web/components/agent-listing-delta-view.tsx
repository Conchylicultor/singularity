import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/text/web";

interface AgentListingDeltaPayload {
  type: "agent_listing_delta";
  addedTypes: string[];
  addedLines: string[];
  removedTypes: string[];
  isInitial: boolean;
  showConcurrencyNote: boolean;
}

interface ParsedAgent {
  name: string;
  description: string;
}

/** Parse `- name: description (Tools: …)` lines into name + description, mirroring skill-listing. */
function parseAgents(lines: string[]): ParsedAgent[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const body = line.slice(2);
      const colonIdx = body.indexOf(": ");
      if (colonIdx === -1) return { name: body, description: "" };
      return { name: body.slice(0, colonIdx), description: body.slice(colonIdx + 2) };
    });
}

export function AgentListingDeltaView({ event }: AttachmentRendererProps) {
  const att = event.attachment as AgentListingDeltaPayload;
  const agents = parseAgents(att.addedLines ?? []);
  const removed = att.removedTypes ?? [];
  const added = agents.length || (att.addedTypes?.length ?? 0);

  const counts = att.isInitial
    ? `(${added})`
    : [added > 0 ? `+${added}` : null, removed.length > 0 ? `−${removed.length}` : null]
        .filter(Boolean)
        .join(" ") || "(no changes)";

  return (
    <CollapsibleCard
      label={
        <span className="font-mono">
          {att.isInitial ? "Agents Available" : "Agents Delta"}{" "}
          <span className="text-muted-foreground/60">
            {att.isInitial ? counts : `(${counts})`}
          </span>
        </span>
      }
    >
      {agents.length === 0 && removed.length === 0 ? (
        <Text as="p" variant="caption" className="text-muted-foreground/60 italic">
          No agents listed.
        </Text>
      ) : (
        <Text as="ul" variant="caption" className="flex flex-col gap-2xs">
          {agents.map((agent) => (
            <li key={agent.name} className="text-muted-foreground">
              <span className="font-semibold text-foreground">{agent.name}</span>
              {agent.description && (
                /* eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset separating description from agent name within a text line; not a flex-sibling gap */
                <span className="ml-1.5 text-muted-foreground/60">— {agent.description}</span>
              )}
            </li>
          ))}
          {removed.map((name) => (
            <li key={name} className="text-muted-foreground line-through">
              <span className="text-destructive no-underline">−</span> {name}
            </li>
          ))}
        </Text>
      )}
    </CollapsibleCard>
  );
}
