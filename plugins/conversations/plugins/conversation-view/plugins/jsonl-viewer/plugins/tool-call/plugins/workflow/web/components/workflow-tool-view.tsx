import { MdAccountTree, MdCode } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  parseWorkflowMeta,
  parseWorkflowResult,
} from "../internal/parse-workflow";
import { useWorkflowTrace } from "../internal/use-workflow-trace";
import { WorkflowGraph } from "./workflow-graph";
import { workflowNodePane } from "../panes";

interface WorkflowInput {
  script?: string;
  scriptPath?: string;
  name?: string;
  args?: unknown;
}

function PhaseList({
  phases,
}: {
  phases: { title?: string; detail?: string }[];
}) {
  return (
    <ol className="space-y-1.5">
      {phases.map((phase, i) => (
        <Text as="li" variant="caption" key={i} className="flex gap-2">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-categorical-6/15 font-mono text-3xs text-categorical-6">
            {i + 1}
          </span>
          <div className="min-w-0">
            <span className="font-medium text-foreground">
              {phase.title ?? "(untitled phase)"}
            </span>
            {phase.detail && (
              <span className="ml-1.5 text-muted-foreground">
                {phase.detail}
              </span>
            )}
          </div>
        </Text>
      ))}
    </ol>
  );
}

function ScriptSection({ script }: { script: string }) {
  const { open, triggerProps, contentId } = useCollapsible({
    defaultOpen: false,
  });
  return (
    <div className="rounded-md border border-border/40">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-caption text-muted-foreground hover:text-foreground"
      >
        <MdCode className="size-3.5 shrink-0" />
        <span className="font-medium">{open ? "Hide" : "View"} script</span>
        <span className="text-3xs opacity-60">
          ({script.split("\n").length} lines)
        </span>
      </button>
      {open && (
        <div id={contentId} className="max-h-96 overflow-auto px-3 pb-2">
          <HighlightedCode code={script} lang="ts" />
        </div>
      )}
    </div>
  );
}

export function WorkflowToolView({ event }: ToolRendererProps) {
  const input = event.input as WorkflowInput;
  const script = input.script ?? "";
  const meta = script ? parseWorkflowMeta(script) : null;
  const name = meta?.name ?? input.name;
  const description = meta?.description;
  const phases = meta?.phases ?? [];

  const { graph, status } = useWorkflowTrace(script, input.args);

  const openPane = useOpenPane();
  const convId = conversationPane.useRouteEntry()?.params.convId;
  const openNode = (nodeId: string) => {
    openPane(
      workflowNodePane,
      { toolUseId: event.toolUseId, nodeId },
      { mode: "push", input: convId ? { convId } : undefined },
    );
  };

  const result = event.result;
  const parsedResult =
    result && !result.isError ? parseWorkflowResult(result.content) : null;

  const agentCount = graph?.nodes.length ?? 0;
  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <Badge size="sm" colorClass="bg-categorical-6/15 text-categorical-6" icon={<MdAccountTree />} className="shrink-0 font-mono">
        {name ?? "workflow"}
      </Badge>
      {phases.length > 0 && (
        <Badge variant="muted" size="sm" className="shrink-0 tracking-wider">
          {phases.length} {phases.length === 1 ? "phase" : "phases"}
        </Badge>
      )}
      {agentCount > 0 && (
        <Badge variant="muted" size="sm" className="shrink-0 tracking-wider">
          {agentCount} {agentCount === 1 ? "agent" : "agents"}
        </Badge>
      )}
      {description && (
        <span className="min-w-0 truncate text-muted-foreground">
          {description}
        </span>
      )}
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary}>
      <Text as="div" variant="caption" className="mt-2 space-y-3">
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}

        {status === "ready" && graph ? (
          <WorkflowGraph graph={graph} onOpenNode={openNode} />
        ) : (
          phases.length > 0 && <PhaseList phases={phases} />
        )}

        {script ? (
          <ScriptSection script={script} />
        ) : input.scriptPath ? (
          <div className="rounded-md border border-border/40 px-3 py-1.5 font-mono text-2xs text-muted-foreground">
            {input.scriptPath}
          </div>
        ) : null}

        {parsedResult && (
          <div className="space-y-1 rounded-md border border-border/40 bg-muted/30 px-3 py-2">
            {parsedResult.summary && (
              <div className="text-foreground">{parsedResult.summary}</div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-2xs text-muted-foreground">
              {parsedResult.runId && (
                <span>
                  Run <span className="font-mono">{parsedResult.runId}</span>
                </span>
              )}
              {parsedResult.taskId && (
                <span>
                  Task <span className="font-mono">{parsedResult.taskId}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {result?.isError && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-2 text-destructive">
            {result.content || "(empty)"}
          </pre>
        )}
      </Text>
    </ToolCallCard>
  );
}
