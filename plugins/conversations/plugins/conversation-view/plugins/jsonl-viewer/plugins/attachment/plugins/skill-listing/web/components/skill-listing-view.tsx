import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/text/web";

interface SkillListingPayload {
  type: "skill_listing";
  content: string;
  skillCount: number;
  isInitial: boolean;
}

interface ParsedSkill {
  name: string;
  description: string;
}

function parseSkills(content: string): ParsedSkill[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const body = line.slice(2);
      const colonIdx = body.indexOf(": ");
      if (colonIdx === -1) return { name: body, description: "" };
      return { name: body.slice(0, colonIdx), description: body.slice(colonIdx + 2) };
    });
}

export function SkillListingView({ event }: AttachmentRendererProps) {
  const att = event.attachment as SkillListingPayload;
  const skills = parseSkills(att.content ?? "");
  const count = att.skillCount ?? skills.length;

  return (
    <CollapsibleCard label="Skills Available" note={`(${count})`}>
      {skills.length === 0 ? (
        <Text as="p" variant="caption" className="text-muted-foreground/60 italic">
          No skills listed.
        </Text>
      ) : (
        <Text as="ul" variant="caption" className="flex flex-col gap-2xs">
          {skills.map((skill) => (
            <li key={skill.name} className="text-muted-foreground">
              <span className="font-semibold text-foreground">{skill.name}</span>
              {skill.description && (
                /* eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset separating description from skill name within a text line; not a flex-sibling gap */
                <span className="ml-1.5 text-muted-foreground/60">
                  — {skill.description}
                </span>
              )}
            </li>
          ))}
        </Text>
      )}
    </CollapsibleCard>
  );
}
