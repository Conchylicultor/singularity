import { useCallback, useEffect, useState } from "react";
import { MdBolt, MdDelete, MdRefresh, MdSend } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { toast } from "@plugins/notifications/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  subscribeEventsTest,
  emitEventsTest,
  directEnqueueEventsTest,
  getEventsTestLog,
  resetEventsTest,
  deleteEventsTestTrigger,
  deleteEventsTestTargeting,
  listEventsTestTriggers,
} from "../../shared/endpoints";

interface TriggerRow {
  id: string;
  jobName: string;
  jobWith: Record<string, unknown>;
  enabled: boolean;
  oneShot: boolean;
  createdAt: string;
  userId: string | null;
}

interface LogEntry {
  label: string;
  userId: string;
  message: string;
  jobId: string;
  firedAt: string;
}

function toastErr(e: unknown, prefix: string) {
  const msg = e instanceof Error ? e.message : String(e);
  toast({ type: "debug", title: prefix, description: msg, variant: "error" });
}

export function EventsTestView() {
  // Subscribe form
  const [subUserId, setSubUserId] = useState("");
  const [subLabel, setSubLabel] = useState("");
  const [subOneShot, setSubOneShot] = useState(true);
  const [subBusy, setSubBusy] = useState(false);

  // Emit form
  const [emitUserId, setEmitUserId] = useState("");
  const [emitMessage, setEmitMessage] = useState("");
  const [emitBusy, setEmitBusy] = useState(false);

  // Delete targeting form
  const [dtLabel, setDtLabel] = useState("");
  const [dtBusy, setDtBusy] = useState(false);

  // Direct enqueue form (Layer-1 test — bypasses events entirely)
  const [deLabel, setDeLabel] = useState("");
  const [deUserId, setDeUserId] = useState("");
  const [deMessage, setDeMessage] = useState("");
  const [deBusy, setDeBusy] = useState(false);

  // Lists
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        fetchEndpoint(listEventsTestTriggers, {}),
        fetchEndpoint(getEventsTestLog, {}),
      ]);
      setTriggers(t.rows as unknown as TriggerRow[]);
      setLog(l.entries);
    } catch (e) {
      toastErr(e, "refresh failed");
    }
  }, []);

  // Initial load + light poll so oneShot deletions and new log entries show.
  useEffect(() => {
    void refresh();
    const iv = setInterval(() => { void refresh(); }, 1000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Briefly highlight a trigger id after it's inserted.
  const flashTrigger = (id: string) => {
    setFlashedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setFlashedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1200);
  };

  // ── Actions ─────────────────────────────────────────────────────────────

  const onSubscribe = async () => {
    if (!subLabel.trim()) {
      toast({ type: "debug", title: "Missing field", description: "label is required", variant: "warning" });
      return;
    }
    setSubBusy(true);
    try {
      const { id } = await fetchEndpoint(subscribeEventsTest, {}, {
        body: {
          userId: subUserId.trim() || undefined,
          label: subLabel.trim(),
          oneShot: subOneShot,
        },
      });
      flashTrigger(id);
      toast({
        type: "debug",
        title: "Subscribed",
        description: `${subUserId.trim() || "match-any"}, ${subOneShot ? "one-shot" : "recurring"}`,
        variant: "success",
      });
      await refresh();
    } catch (e) {
      toastErr(e, "subscribe failed");
    } finally {
      setSubBusy(false);
    }
  };

  const onEmit = async () => {
    if (!emitUserId.trim()) {
      toast({ type: "debug", title: "Missing field", description: "userId is required", variant: "warning" });
      return;
    }
    setEmitBusy(true);
    try {
      await fetchEndpoint(emitEventsTest, {}, {
        body: {
          userId: emitUserId.trim(),
          message: emitMessage.trim() || undefined,
        },
      });
      toast({
        type: "debug",
        title: "Event emitted",
        description: `pinged(userId="${emitUserId.trim()}")`,
        variant: "info",
      });
      await refresh();
    } catch (e) {
      toastErr(e, "emit failed");
    } finally {
      setEmitBusy(false);
    }
  };

  const onDeleteTrigger = async (id: string) => {
    try {
      await fetchEndpoint(deleteEventsTestTrigger, { id });
      toast({ type: "debug", title: "Trigger deleted", description: `Trigger ${id}`, variant: "success" });
      await refresh();
    } catch (e) {
      toastErr(e, "delete failed");
    }
  };

  const onDeleteTargeting = async () => {
    if (!dtLabel.trim()) {
      toast({ type: "debug", title: "Missing field", description: "label is required", variant: "warning" });
      return;
    }
    setDtBusy(true);
    try {
      await fetchEndpoint(deleteEventsTestTargeting, {}, {
        body: { label: dtLabel.trim() },
      });
      toast({
        type: "debug",
        title: "Triggers swept",
        description: `label="${dtLabel.trim()}"`,
        variant: "success",
      });
      setDtLabel("");
      await refresh();
    } catch (e) {
      toastErr(e, "delete-targeting failed");
    } finally {
      setDtBusy(false);
    }
  };

  const onDirectEnqueue = async () => {
    if (!deLabel.trim()) {
      toast({ type: "debug", title: "Missing field", description: "label is required", variant: "warning" });
      return;
    }
    setDeBusy(true);
    try {
      const { jobId } = await fetchEndpoint(directEnqueueEventsTest, {}, {
        body: {
          label: deLabel.trim(),
        },
      });
      toast({
        type: "debug",
        title: "Job enqueued",
        description: `Job ${jobId}`,
        variant: "success",
      });
      await refresh();
    } catch (e) {
      toastErr(e, "direct-enqueue failed");
    } finally {
      setDeBusy(false);
    }
  };

  const onResetLog = async () => {
    try {
      await fetchEndpoint(resetEventsTest, {});
      toast({ type: "debug", title: "Log cleared", description: "Events test log reset", });
      await refresh();
    } catch (e) {
      toastErr(e, "reset failed");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Text as="h1" variant="title" className="tracking-tight">
              Events Test
            </Text>
            <Text as="p" variant="body" tone="muted">
              Exercises the <code className="rounded-md bg-muted px-1">events</code>{" "}
              and <code className="rounded-md bg-muted px-1">jobs</code> plugins:
              subscribe a trigger, emit a payload, watch the job fire. Backed
              by <code className="rounded-md bg-muted px-1">events_test.pinged</code>{" "}
              event and{" "}
              <code className="rounded-md bg-muted px-1">events_test.log</code>{" "}
              job.
            </Text>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh}>
            <MdRefresh className="size-4" />
            Refresh
          </Button>
        </header>

        {/* Subscribe + Emit forms */}
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Subscribe">
            <FieldRow label="userId (filter)">
              <Input
                placeholder="empty = match any"
                value={subUserId}
                onChange={(e) => setSubUserId(e.target.value)}
              />
            </FieldRow>
            <FieldRow label="label (job config)">
              <Input
                placeholder="required"
                value={subLabel}
                onChange={(e) => setSubLabel(e.target.value)}
              />
            </FieldRow>
            <Text as="label" variant="body" tone="muted" className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={subOneShot}
                onChange={(e) => setSubOneShot(e.target.checked)}
                className="size-4 rounded-md border-input"
              />
              oneShot (delete row after fire)
            </Text>
            <Button onClick={onSubscribe} disabled={subBusy}>
              <MdBolt className="size-4" />
              {subBusy ? "Subscribing…" : "Subscribe"}
            </Button>
          </Section>

          <Section title="Emit">
            <FieldRow label="userId (payload)">
              <Input
                placeholder="required"
                value={emitUserId}
                onChange={(e) => setEmitUserId(e.target.value)}
              />
            </FieldRow>
            <FieldRow label="message (payload)">
              <Input
                placeholder="optional; defaults to 'hello'"
                value={emitMessage}
                onChange={(e) => setEmitMessage(e.target.value)}
              />
            </FieldRow>
            <Button
              variant="secondary"
              onClick={onEmit}
              disabled={emitBusy}
              className="mt-auto"
            >
              <MdSend className="size-4" />
              {emitBusy ? "Emitting…" : "Emit pinged"}
            </Button>
          </Section>
        </div>

        {/* Direct enqueue — Layer 1 test (bypasses events) */}
        <Section
          title="Direct enqueue (Layer 1)"
          action={
            <Text as="span" variant="caption" tone="muted">
              calls logPing.enqueue(...) — no trigger row involved
            </Text>
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            <FieldRow label="label">
              <Input
                placeholder="required"
                value={deLabel}
                onChange={(e) => setDeLabel(e.target.value)}
              />
            </FieldRow>
            <FieldRow label="userId">
              <Input
                placeholder="default 'direct'"
                value={deUserId}
                onChange={(e) => setDeUserId(e.target.value)}
              />
            </FieldRow>
            <FieldRow label="message">
              <Input
                placeholder="default 'direct-enqueued'"
                value={deMessage}
                onChange={(e) => setDeMessage(e.target.value)}
              />
            </FieldRow>
          </div>
          <Button
            variant="secondary"
            onClick={onDirectEnqueue}
            disabled={deBusy}
            className="self-start"
          >
            <MdSend className="size-4" />
            {deBusy ? "Enqueueing…" : "Enqueue job"}
          </Button>
        </Section>

        {/* Active triggers */}
        <Section
          title={`Active triggers (${triggers.length})`}
          action={
            <Text as="span" variant="caption" tone="muted">
              polls every 1s — one-shot rows disappear after fire
            </Text>
          }
        >
          {triggers.length === 0 ? (
            <Empty>No triggers subscribed yet.</Empty>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {triggers.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-body transition-colors",
                    flashedIds.has(t.id) && "bg-success/10",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="muted" size="md" className="font-mono">
                        {t.userId ?? "(any)"}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <Text as="span" variant="caption" className="font-mono">{t.jobName}</Text>
                      <Text as="span" variant="caption" tone="muted" className="truncate">
                        {JSON.stringify(t.jobWith)}
                      </Text>
                    </div>
                    <Text as="div" variant="caption" tone="muted" className="flex items-center gap-2">
                      <span>{t.oneShot ? "one-shot" : "recurring"}</span>
                      <span>·</span>
                      <span className="truncate font-mono">{t.id}</span>
                    </Text>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteTrigger(t.id)}
                    aria-label="Delete trigger"
                  >
                    <MdDelete className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Cleanup by config */}
        <Section title="Delete triggers by job config">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FieldRow label="label match">
                <Input
                  placeholder="exact label to sweep (JSONB @>)"
                  value={dtLabel}
                  onChange={(e) => setDtLabel(e.target.value)}
                />
              </FieldRow>
            </div>
            <Button
              variant="outline"
              onClick={onDeleteTargeting}
              disabled={dtBusy}
            >
              <MdDelete className="size-4" />
              Sweep
            </Button>
          </div>
        </Section>

        {/* Job log */}
        <Section
          title={`Job log (${log.length})`}
          action={
            <Button variant="ghost" size="sm" onClick={onResetLog}>
              <MdDelete className="size-4" />
              Clear
            </Button>
          }
        >
          {log.length === 0 ? (
            <Empty>No jobs fired yet. Emit a payload above.</Empty>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {log.map((e, i) => (
                <Text
                  as="div"
                  variant="body"
                  key={`${e.jobId}-${e.firedAt}-${i}`}
                  className="flex flex-col gap-0.5 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge size="md" colorClass="bg-info/10 text-info-foreground" className="font-mono">
                      {e.label}
                    </Badge>
                    <span className="text-muted-foreground">fired for</span>
                    <Text as="span" variant="caption" className="font-mono">
                      userId={e.userId}
                    </Text>
                    <Text as="span" variant="caption" tone="muted" className="truncate">
                      msg={JSON.stringify(e.message)}
                    </Text>
                  </div>
                  <Text as="div" variant="caption" tone="muted" className="truncate">
                    {new Date(e.firedAt).toLocaleTimeString()} ·{" "}
                    <span className="font-mono">job {e.jobId}</span>
                  </Text>
                </Text>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <Text as="h2" variant="label">{title}</Text>
        {action}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Text as="label" variant="caption" tone="muted">{label}</Text>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text as="div" variant="body" tone="muted" className="rounded-md border border-dashed border-border px-3 py-6 text-center">
      {children}
    </Text>
  );
}
