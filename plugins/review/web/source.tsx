import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import type { Push } from "@plugins/tasks/core";

export type Source =
  | { kind: "working" }
  | { kind: "push"; pushId: string };

export interface ReviewProps extends Record<string, unknown> {
  conversationId: string;
  source: Source;
}

export interface PushGroup {
  pushId: string;
  message: string;
  count: number;
  createdAt: Date;
}

export function groupPushes(rows: Push[]): PushGroup[] {
  const byId = new Map<string, PushGroup>();
  for (const row of rows) {
    const existing = byId.get(row.pushId);
    const createdAt = new Date(row.createdAt);
    if (existing) {
      existing.count += 1;
      if (createdAt > existing.createdAt) {
        existing.createdAt = createdAt;
        existing.message = row.message;
      }
    } else {
      byId.set(row.pushId, {
        pushId: row.pushId,
        message: row.message,
        count: 1,
        createdAt,
      });
    }
  }
  return [...byId.values()].sort((a, b) => +b.createdAt - +a.createdAt);
}

function formatDate(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SourceTabs({
  source,
  onChange,
  pushGroups,
}: {
  source: Source;
  onChange: (next: Source) => void;
  pushGroups: PushGroup[];
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
      <ToggleChip
        active={source.kind === "working"}
        size="sm"
        onClick={() => onChange({ kind: "working" })}
        title="Uncommitted changes vs. main"
      >
        Working tree
      </ToggleChip>
      {pushGroups.map((g) => (
        <ToggleChip
          key={g.pushId}
          active={source.kind === "push" && source.pushId === g.pushId}
          size="sm"
          onClick={() => onChange({ kind: "push", pushId: g.pushId })}
          title={`${g.message} · ${formatDate(g.createdAt)}`}
        >
          <span className="max-w-[24ch] truncate">{g.message}</span>
          {g.count > 1 && (
            <span className="ml-1 text-muted-foreground tabular-nums">
              ×{g.count}
            </span>
          )}
        </ToggleChip>
      ))}
    </div>
  );
}
