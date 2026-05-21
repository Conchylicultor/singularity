import { MdArticle } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { agentReportPane } from "../panes";

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

  const openPane = useOpenPane();
  const convId = conversationPane.useChainEntry()?.params.convId;

  const openReport = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    openPane(
      agentReportPane,
      { toolUseId: event.toolUseId },
      { mode: "push", input: convId ? { convId } : undefined },
    );
  };

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
      {result && (
        <span
          role="button"
          tabIndex={0}
          className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={openReport}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openReport(e);
            }
          }}
        >
          <MdArticle className="size-3.5" />
        </span>
      )}
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary}>
      <div className="mt-2 space-y-2">
        {/* Prompt */}
        <div className="prose-xs max-h-96 overflow-auto px-3 py-2 text-xs">
          <Markdown>{prompt}</Markdown>
        </div>

        {/* Report link */}
        {result && (
          <button
            onClick={openReport}
            className="flex w-full items-center gap-1.5 rounded-md border border-border/40 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40"
          >
            <MdArticle className="size-3.5 shrink-0" />
            <span className="font-medium">
              {result.isError ? "View error" : "View report"}
            </span>
          </button>
        )}
      </div>
    </ToolCallCard>
  );
}
