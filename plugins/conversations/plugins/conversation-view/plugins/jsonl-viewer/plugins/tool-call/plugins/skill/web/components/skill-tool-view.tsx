import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

type SkillInput = { skill: string; args?: string };

export function SkillToolView({ event }: ToolRendererProps) {
  const input = event.input as SkillInput;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; input is `as`-cast from unknown
  const skillName = input.skill ?? "";
  const args = typeof input.args === "string" ? input.args : "";
  const injected = event.injectedContext ?? [];

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
        {skillName}
      </span>
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
            <pre className="whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-xs">
              {args}
            </pre>
          )}
          {injected.map((ctx, i) => (
            <details key={i} className="rounded border border-border/40">
              <summary className="cursor-pointer px-2 py-1 text-xs text-muted-foreground">
                Skill context
              </summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words px-2 py-2 text-xs text-muted-foreground">
                {ctx}
              </pre>
            </details>
          ))}
        </div>
      )}
    </ToolCallCard>
  );
}
