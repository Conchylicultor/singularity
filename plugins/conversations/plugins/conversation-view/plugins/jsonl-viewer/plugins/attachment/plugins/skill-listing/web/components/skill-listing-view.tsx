import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

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
  const { open, triggerProps, contentId } = useCollapsible();
  const skills = parseSkills(att.content ?? "");
  const count = att.skillCount ?? skills.length;

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <span className="font-mono">
          Skills Available{" "}
          <span className="text-muted-foreground/60">({count})</span>
        </span>
      </button>
      {open && (
        <div id={contentId} className="mt-2 border-l-2 border-muted-foreground/20 pl-3">
          {skills.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">No skills listed.</p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs leading-5">
              {skills.map((skill) => (
                <li key={skill.name} className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{skill.name}</span>
                  {skill.description && (
                    <span className="ml-1.5 text-muted-foreground/60">
                      — {skill.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
