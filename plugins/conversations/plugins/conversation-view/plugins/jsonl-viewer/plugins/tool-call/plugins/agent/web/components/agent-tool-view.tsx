import { MdArticle } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import { MODEL_TIERS, modelDisplayLabel } from "@plugins/conversations/plugins/model-provider/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { agentReportPane } from "../panes";

interface AgentInput {
  prompt: string;
  description?: string;
  subagent_type?: string;
  model?: string;
  isolation?: string;
  run_in_background?: boolean;
}

function ModelBadge({ model }: { model: string }) {
  const tier = MODEL_TIERS.find((t) => model.includes(t));
  const colors = tier ? familyClass(tier) : "bg-muted text-muted-foreground";
  return (
    <Badge size="sm" colorClass={colors} className="shrink-0 font-mono">
      {modelDisplayLabel(model)}
    </Badge>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="muted" size="sm" className="shrink-0 tracking-wider">
      {children}
    </Badge>
  );
}

export function AgentToolView({ event }: ToolRendererProps) {
  const input = event.input as AgentInput;
  const agentType = input.subagent_type ?? "general-purpose";
  const description = input.description ?? "";
  const prompt = input.prompt ?? "";
  const result = event.result;

  const openPane = useOpenPane();
  const convId = conversationPane.useRouteEntry()?.params.convId;

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
      <Badge size="sm" colorClass="bg-categorical-6/15 text-categorical-6" className="shrink-0 font-mono">
        {agentType}
      </Badge>
      {input.model && <ModelBadge model={input.model} />}
      {input.run_in_background && <MetaBadge>Background</MetaBadge>}
      {input.isolation === "worktree" && <MetaBadge>Worktree</MetaBadge>}
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
          <Row
            size="sm"
            hover="muted"
            bordered
            onClick={openReport}
            className="rounded-md border-border/40 text-muted-foreground"
            icon={<MdArticle className="size-3.5 shrink-0" />}
          >
            <span className="font-medium">
              {result.isError ? "View error" : "View report"}
            </span>
          </Row>
        )}
      </div>
    </ToolCallCard>
  );
}
