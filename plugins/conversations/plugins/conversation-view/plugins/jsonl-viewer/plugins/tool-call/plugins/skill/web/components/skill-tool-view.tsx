import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";

type SkillInput = { skill: string; args?: string };

export function SkillToolView({ event }: ToolRendererProps) {
  const input = event.input as SkillInput;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; input is `as`-cast from unknown
  const skillName = input.skill ?? "";
  const args = typeof input.args === "string" ? input.args : "";
  const injected = event.injectedContext ?? [];

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <Badge size="sm" colorClass="bg-muted text-foreground" className="shrink-0 font-mono">
        {skillName}
      </Badge>
      {args && (
        <span className="min-w-0 truncate text-muted-foreground">{args}</span>
      )}
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary}>
      {(args || injected.length > 0) && (
        <div className="mt-2 space-y-2">
          {args && (
            <pre className="text-caption whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2">
              {args}
            </pre>
          )}
          {injected.map((ctx, i) => (
            <details key={i} className="rounded-md border border-border/40">
              <summary className="text-caption cursor-pointer px-2 py-1 text-muted-foreground">
                Skill context
              </summary>
              <pre className="text-caption max-h-96 overflow-auto whitespace-pre-wrap break-words px-2 py-2 text-muted-foreground">
                {ctx}
              </pre>
            </details>
          ))}
        </div>
      )}
    </ToolCallCard>
  );
}
