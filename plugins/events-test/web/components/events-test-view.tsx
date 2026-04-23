import { useCallback, useEffect, useState } from "react";
import { MdBolt, MdDelete, MdRefresh, MdSend } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TriggerRow {
  id: string;
  actionName: string;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  oneShot: boolean;
  createdAt: string;
  userId: string | null;
}

interface LogEntry {
  label: string;
  payload: { userId: string; message: string };
  triggerId: string;
  firedAt: string;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return jsonFetch<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function toastErr(e: unknown, prefix: string) {
  const msg = e instanceof Error ? e.message : String(e);
  Shell.Toast({ description: `${prefix}: ${msg}`, variant: "error" });
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

  // Lists
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        jsonFetch<{ rows: TriggerRow[] }>("/api/events-test/triggers"),
        jsonFetch<{ entries: LogEntry[] }>("/api/events-test/log"),
      ]);
      setTriggers(t.rows);
      setLog(l.entries);
    } catch (e) {
      toastErr(e, "refresh failed");
    }
  }, []);

  // Initial load + light poll so oneShot deletions and new log entries show.
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 1000);
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
      Shell.Toast({ description: "label is required", variant: "warning" });
      return;
    }
    setSubBusy(true);
    try {
      const { id } = await postJson<{ id: string }>(
        "/api/events-test/subscribe",
        {
          userId: subUserId.trim() || undefined,
          label: subLabel.trim(),
          oneShot: subOneShot,
        },
      );
      flashTrigger(id);
      Shell.Toast({
        description: `Subscribed (${subUserId.trim() || "match-any"}, ${subOneShot ? "one-shot" : "recurring"})`,
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
      Shell.Toast({ description: "userId is required", variant: "warning" });
      return;
    }
    setEmitBusy(true);
    try {
      await postJson("/api/events-test/emit", {
        userId: emitUserId.trim(),
        message: emitMessage.trim() || undefined,
      });
      Shell.Toast({
        description: `Emitted pinged(userId="${emitUserId.trim()}")`,
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
      await fetch(`/api/events-test/trigger/${id}`, { method: "DELETE" });
      Shell.Toast({ description: "Trigger deleted", variant: "success" });
      await refresh();
    } catch (e) {
      toastErr(e, "delete failed");
    }
  };

  const onDeleteTargeting = async () => {
    if (!dtLabel.trim()) {
      Shell.Toast({ description: "label is required", variant: "warning" });
      return;
    }
    setDtBusy(true);
    try {
      await postJson("/api/events-test/delete-targeting", {
        label: dtLabel.trim(),
      });
      Shell.Toast({
        description: `Swept triggers with label="${dtLabel.trim()}"`,
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

  const onResetLog = async () => {
    try {
      await fetch("/api/events-test/reset", { method: "POST" });
      Shell.Toast({ description: "Log cleared", variant: "default" });
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
            <h1 className="text-xl font-semibold tracking-tight">
              Events Test
            </h1>
            <p className="text-sm text-muted-foreground">
              Exercises the <code className="rounded bg-muted px-1">events</code>{" "}
              plugin: subscribe a trigger, emit a payload, watch the action
              fire. Backed by{" "}
              <code className="rounded bg-muted px-1">events_test.pinged</code>{" "}
              event and{" "}
              <code className="rounded bg-muted px-1">events_test.log</code>{" "}
              action.
            </p>
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
            <FieldRow label="label (action config)">
              <Input
                placeholder="required"
                value={subLabel}
                onChange={(e) => setSubLabel(e.target.value)}
              />
            </FieldRow>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={subOneShot}
                onChange={(e) => setSubOneShot(e.target.checked)}
                className="size-4 rounded border-input"
              />
              oneShot (delete row after fire)
            </label>
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

        {/* Active triggers */}
        <Section
          title={`Active triggers (${triggers.length})`}
          action={
            <span className="text-xs text-muted-foreground">
              polls every 1s — one-shot rows disappear after fire
            </span>
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
                    "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                    flashedIds.has(t.id) && "bg-success/10",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {t.userId ?? "(any)"}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono text-xs">{t.actionName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {JSON.stringify(t.actionConfig)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t.oneShot ? "one-shot" : "recurring"}</span>
                      <span>·</span>
                      <span className="truncate font-mono">{t.id}</span>
                    </div>
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
        <Section title="Delete triggers by action config">
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

        {/* Action log */}
        <Section
          title={`Action log (${log.length})`}
          action={
            <Button variant="ghost" size="sm" onClick={onResetLog}>
              <MdDelete className="size-4" />
              Clear
            </Button>
          }
        >
          {log.length === 0 ? (
            <Empty>No actions fired yet. Emit a payload above.</Empty>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {log.map((e, i) => (
                <div
                  key={`${e.triggerId}-${e.firedAt}-${i}`}
                  className="flex flex-col gap-0.5 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-info/10 px-1.5 py-0.5 font-mono text-xs text-info-foreground">
                      {e.label}
                    </span>
                    <span className="text-muted-foreground">fired for</span>
                    <span className="font-mono text-xs">
                      userId={e.payload.userId}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      msg={JSON.stringify(e.payload.message)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {new Date(e.firedAt).toLocaleTimeString()} ·{" "}
                    <span className="font-mono">{e.triggerId}</span>
                  </div>
                </div>
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
        <h2 className="text-sm font-medium">{title}</h2>
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
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
