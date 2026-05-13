import { AlertTriangle, ArrowRight } from "lucide-react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  CollapsibleChevron,
  useCollapsible,
} from "@plugins/primitives/plugins/collapsible/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { turnSummariesResource } from "@plugins/conversations/plugins/conversation-view/plugins/turn-summary/shared";

function parseBullets(text: string): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      out.push(buf.join(" ").trim());
      buf = [];
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/g, "");
    const m = line.match(/^\s*[-*+]\s+(.*)$/);
    if (m && m[1] !== undefined) {
      flush();
      buf.push(m[1]);
    } else if (line.trim() === "") {
      flush();
    } else if (buf.length) {
      buf.push(line.trim());
    } else if (out.length === 0) {
      // Leading non-bullet text — treat as a single item.
      buf.push(line.trim());
    }
  }
  flush();
  return out.filter(Boolean);
}

export function TurnSummaryCard({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const { data } = useResource(turnSummariesResource);
  const { open, toggle } = useCollapsible({ defaultOpen: true });
  const summary = data[conversation.id];
  if (!summary) return null;

  const caveats = parseBullets(summary.caveats);
  const actions = parseBullets(summary.actions);
  const hasDetail = caveats.length > 0 || actions.length > 0;

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <button
        type="button"
        onClick={hasDetail ? toggle : undefined}
        className={`flex w-full items-start gap-1.5 text-left ${
          hasDetail ? "cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={hasDetail ? open : undefined}
      >
        {hasDetail ? (
          <CollapsibleChevron open={open} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span className="flex-1 leading-snug">
          {summary.summary || "(no summary)"}
        </span>
      </button>
      {hasDetail && open && (
        <div className="mt-2 ml-5 space-y-2">
          {caveats.length > 0 && (
            <BulletList
              icon={
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400" />
              }
              items={caveats}
            />
          )}
          {actions.length > 0 && (
            <BulletList
              icon={
                <ArrowRight className="mt-0.5 size-3 shrink-0 text-sky-600 dark:text-sky-400" />
              }
              items={actions}
            />
          )}
        </div>
      )}
    </div>
  );
}

function BulletList({
  icon,
  items,
}: {
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5">
          {icon}
          <span className="leading-snug">{item}</span>
        </li>
      ))}
    </ul>
  );
}
