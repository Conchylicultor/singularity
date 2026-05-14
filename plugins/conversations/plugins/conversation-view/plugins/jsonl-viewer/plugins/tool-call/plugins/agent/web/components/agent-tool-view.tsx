import { useState } from "react";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";

interface AgentInput {
  prompt: string;
  description?: string;
  subagent_type?: string;
  model?: string;
  isolation?: string;
  run_in_background?: boolean;
}

const modelColors: Record<string, string> = {
  opus: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sonnet: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  haiku: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

function ModelBadge({ model }: { model: string }) {
  const colors = modelColors[model] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] capitalize ${colors}`}
    >
      {model}
    </span>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

export function AgentToolView({ event }: ToolRendererProps) {
  const input = event.input as AgentInput;
  const agentType = input.subagent_type ?? "general-purpose";
  const description = input.description ?? "";
  const prompt = input.prompt ?? "";
  const result = event.result;
  const isRunning = !result;

  const [promptOpen, setPromptOpen] = useState(isRunning);

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[11px] text-violet-700 dark:text-violet-400">
        {agentType}
      </span>
      {input.model && <ModelBadge model={input.model} />}
      {input.run_in_background && <MetaBadge>bg</MetaBadge>}
      {input.isolation === "worktree" && <MetaBadge>worktree</MetaBadge>}
      {description && (
        <span className="min-w-0 truncate text-muted-foreground">
          {description}
        </span>
      )}
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary}>
      <div className="mt-2 space-y-2">
        {/* Prompt section — collapsible */}
        <div className="rounded-md border border-border/40">
          <button
            onClick={() => setPromptOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40"
          >
            <span
              className="text-[10px] transition-transform"
              style={{ transform: promptOpen ? "rotate(90deg)" : undefined }}
            >
              ▶
            </span>
            <span className="font-medium">Prompt</span>
          </button>
          {promptOpen && (
            <div className="border-t border-border/30 px-3 py-2">
              <div className="prose-xs max-h-96 overflow-auto text-xs">
                <Markdown>{prompt}</Markdown>
              </div>
            </div>
          )}
        </div>

        {/* Report section */}
        {result && (
          <div className="rounded-md border border-border/40">
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Report
            </div>
            <div className="border-t border-border/30 px-3 py-2">
              <div
                className={`prose-xs max-h-[32rem] overflow-auto text-xs ${
                  result.isError ? "text-destructive" : ""
                }`}
              >
                {result.isError ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {result.content}
                  </pre>
                ) : (
                  <Markdown>{result.content}</Markdown>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolCallCard>
  );
}
