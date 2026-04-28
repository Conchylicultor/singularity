import { useEffect, useRef, useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  conversationSummariesResource,
  type ConversationSummary,
  type Phase,
} from "../../shared/resources";

// Bound the spinner so a wedged Sonnet conversation eventually surfaces
// rather than hanging the chip forever. Matches the server-side reaper
// (CLEANUP_AFTER_MS in handle-generate.ts) so the two timers agree.
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

const PHASE_LABEL: Record<Phase, string> = {
  clarification_needed: "Clarification",
  design_review: "Design review",
  implementation_review: "Impl review",
  investigating: "Investigating",
  executing: "Executing",
  other: "Other",
};

const PHASE_CLASSES: Record<Phase, string> = {
  clarification_needed:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25",
  design_review:
    "bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25",
  implementation_review:
    "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/25",
  investigating:
    "bg-slate-500/15 text-slate-700 dark:text-slate-300 hover:bg-slate-500/25",
  executing:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25",
  other:
    "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-500/25",
};

export function SummarizeButton() {
  const { conversation } = conversationPane.useData();
  const { data: byConversation } = useResource(conversationSummariesResource);
  const summaries: ConversationSummary[] | undefined =
    byConversation?.[conversation.id];
  const latest = summaries?.[0];

  const [pendingSince, setPendingSince] = useState<number | null>(null);

  // Resource updates with a summary newer than our pendingSince → success.
  const lastSeenIdRef = useRef<string | null>(latest?.id ?? null);
  useEffect(() => {
    if (!latest) return;
    if (lastSeenIdRef.current === latest.id) return;
    lastSeenIdRef.current = latest.id;
    if (pendingSince !== null) {
      setPendingSince(null);
      Shell.Toast({ description: "Summary ready", variant: "success" });
    }
  }, [latest?.id, pendingSince]);

  // Timeout fallback so a stuck spawn surfaces.
  useEffect(() => {
    if (pendingSince === null) return;
    const remaining = pendingSince + PENDING_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      setPendingSince(null);
      Shell.Toast({
        description: "Summarisation timed out",
        variant: "error",
      });
      return;
    }
    const t = setTimeout(() => {
      setPendingSince(null);
      Shell.Toast({
        description: "Summarisation timed out",
        variant: "error",
      });
    }, remaining);
    return () => clearTimeout(t);
  }, [pendingSince]);

  async function onClick() {
    if (pendingSince !== null) return;
    setPendingSince(Date.now());
    try {
      const res = await fetch(
        `/api/conversation-summary/${encodeURIComponent(conversation.id)}/generate`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setPendingSince(null);
      Shell.Toast({
        description: `Summarise failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    }
  }

  if (pendingSince !== null) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="gap-1.5 text-xs"
        title="Summarising…"
        aria-label="Summarising"
      >
        <MdAutoAwesome className="size-3.5 animate-pulse" />
        Summarising…
      </Button>
    );
  }

  if (!latest) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className="gap-1.5 text-xs"
        title="Summarise this conversation"
        aria-label="Summarise"
      >
        <MdAutoAwesome className="size-3.5" />
        Summarise
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        className={`${buttonVariants({ variant: "ghost", size: "sm" })} gap-1.5`}
        title={`Summary: ${PHASE_LABEL[latest.phase]} — click for details`}
        aria-label={`Summary: ${PHASE_LABEL[latest.phase]}`}
      >
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_CLASSES[latest.phase]}`}
        >
          {PHASE_LABEL[latest.phase]}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[90vw] space-y-3 text-sm">
        <SummaryDetail summary={latest} onResummarize={onClick} />
      </PopoverContent>
    </Popover>
  );
}

function SummaryDetail({
  summary,
  onResummarize,
}: {
  summary: ConversationSummary;
  onResummarize: () => void;
}) {
  const generated = new Date(summary.generatedAt);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_CLASSES[summary.phase]}`}
        >
          {PHASE_LABEL[summary.phase]}
        </span>
        <span className="text-xs text-muted-foreground" title={generated.toISOString()}>
          {formatRelative(generated)} · {summary.turnCountAtGeneration} turns
        </span>
      </div>

      {summary.phaseDetail && (
        <Section label="Detail">{summary.phaseDetail}</Section>
      )}
      <Section label="Next action">{summary.nextAction}</Section>
      {summary.flags && (
        <Section label="Flags" tone="warn">
          {summary.flags}
        </Section>
      )}
      {summary.notes && <Section label="Notes">{summary.notes}</Section>}

      <div className="flex justify-end pt-1">
        <Button size="sm" variant="outline" onClick={onResummarize} className="gap-1.5 text-xs">
          <MdAutoAwesome className="size-3.5" />
          Re-summarise
        </Button>
      </div>
    </>
  );
}

function Section({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "warn";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`text-[10px] uppercase tracking-wide ${
          tone === "warn"
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function formatRelative(date: Date): string {
  const ms = Date.now() - date.getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
