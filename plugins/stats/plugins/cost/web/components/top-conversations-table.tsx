import { ChartState, useFetchJson } from "@plugins/stats/plugins/commits/web";
import { cn } from "@/lib/utils";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { formatTokensCompact, formatUsd } from "./format";
import { useScope, withScope } from "./use-scope";

interface Row {
  sessionId: string;
  conversationId: string | null;
  title: string | null;
  status: string | null;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  lastActivity: string;
  modelsUsed: string[];
}

export function TopConversationsTable() {
  const { scope } = useScope();
  const { data, error } = useFetchJson<{ rows: Row[] }>(
    withScope("/api/stats/cost/sessions?limit=50", scope),
    scope,
  );
  return (
    <ChartState
      error={error}
      loading={data === null}
      empty={!!data && data.rows.length === 0}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b text-left text-caption text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Conversation</th>
              <th className="px-2 py-1.5 font-medium">Model(s)</th>
              <th className="px-2 py-1.5 text-right font-medium">Cost</th>
              <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
              <th className="px-2 py-1.5 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <TopRow key={r.sessionId} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </ChartState>
  );
}

function TopRow({ row }: { row: Row }) {
  const openPane = useOpenPane();
  const totalTokens =
    row.inputTokens +
    row.outputTokens +
    row.cacheCreationTokens +
    row.cacheReadTokens;
  const isClickable = !!row.conversationId;
  const onClick = isClickable
    ? () => openPane(conversationPane, { convId: row.conversationId! }, { mode: "push" })
    : undefined;
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border/50",
        isClickable && "cursor-pointer hover:bg-muted/50",
      )}
    >
      <td className="px-2 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium text-foreground">
            {row.title ?? <UntitledLabel sessionId={row.sessionId} />}
          </span>
          {row.status && (
            <span className="text-caption text-muted-foreground">{row.status}</span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-caption text-muted-foreground">
        {row.modelsUsed.join(", ")}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {formatUsd(row.totalCost)}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
        {formatTokensCompact(totalTokens)}
      </td>
      <td className="px-2 py-1.5 text-caption text-muted-foreground">
        {row.lastActivity}
      </td>
    </tr>
  );
}

function UntitledLabel({ sessionId }: { sessionId: string }) {
  return (
    <span className="font-mono text-caption text-muted-foreground">
      {sessionId.slice(0, 8)}…
    </span>
  );
}
