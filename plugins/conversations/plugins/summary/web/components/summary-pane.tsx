import { useEffect, useRef, useState } from "react";
import { MdAutoAwesome } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { toast } from "@plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Button } from "@/components/ui/button";
import {
  conversationSummariesResource,
  type ConversationSummary,
} from "../../shared/resources";
import { PHASE_CLASSES, PHASE_LABEL } from "./phase-styles";
import { convSummaryPane } from "../panes";

// Bound the spinner so a wedged Sonnet conversation eventually surfaces
// rather than hanging the chip forever. Matches the server-side reaper
// (CLEANUP_AFTER_MS in handle-generate.ts) so the two timers agree.
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

export function SummaryPane() {
  const { convId: inputConvId } = convSummaryPane.useInput();
  const chainEntry = conversationPane.useChainEntry();
  const convId = inputConvId ?? chainEntry?.params.convId;
  const summariesResult = useResource(conversationSummariesResource);
  const summaries: ConversationSummary[] | undefined =
    summariesResult.pending ? undefined : summariesResult.data[convId ?? ""];
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
      toast({ type: "summary", description: "Summary ready", variant: "success" });
    }
  }, [latest, pendingSince]);

  // Timeout fallback so a stuck spawn surfaces.
  useEffect(() => {
    if (pendingSince === null) return;
    const remaining = pendingSince + PENDING_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      setPendingSince(null);
      toast({ type: "summary", description: "Summarisation timed out", variant: "error" });
      return;
    }
    const t = setTimeout(() => {
      setPendingSince(null);
      toast({ type: "summary", description: "Summarisation timed out", variant: "error" });
    }, remaining);
    return () => clearTimeout(t);
  }, [pendingSince]);

  async function onSummarize() {
    if (pendingSince !== null) return;
    if (!convId) return;
    setPendingSince(Date.now());
    try {
      const res = await fetch(
        `/api/conversation-summary/${encodeURIComponent(convId)}/generate`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setPendingSince(null);
      toast({
        type: "summary",
        description: `Summarise failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    }
  }

  const isPending = pendingSince !== null;

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <Button
        size="sm"
        variant="outline"
        onClick={onSummarize}
        disabled={isPending}
        className="gap-1.5 self-start text-xs"
        aria-label={isPending ? "Summarising" : latest ? "Re-summarise" : "Summarise"}
      >
        <MdAutoAwesome
          className={`size-3.5 ${isPending ? "animate-pulse" : ""}`}
        />
        {isPending ? "Summarising…" : latest ? "Re-summarise" : "Summarise"}
      </Button>

      {latest ? (
        <SummaryCard summary={latest} />
      ) : (
        <div className="text-xs text-muted-foreground">
          No summary yet. Click Summarise to generate one.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ summary }: { summary: ConversationSummary }) {
  const generated = new Date(summary.generatedAt);
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_CLASSES[summary.phase]}`}
        >
          {PHASE_LABEL[summary.phase]}
        </span>
        <span
          className="text-xs text-muted-foreground"
          title={generated.toISOString()}
        >
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
    </div>
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
            ? "text-warning"
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
