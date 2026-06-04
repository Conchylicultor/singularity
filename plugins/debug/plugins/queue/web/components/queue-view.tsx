import { useMemo, useState } from "react";
import { MdBolt, MdDelete, MdRefresh, MdReplay, MdWorkOutline } from "react-icons/md";
import { toast } from "@plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { FilterChip, useChipFilter } from "@plugins/primitives/plugins/filter-chips/web";
import { jobsListResource, type JobRow, type JobState } from "@plugins/infra/plugins/jobs/core";
import { eventEmissionsResource, eventTriggersResource, type EmissionRow, type TriggerRow } from "@plugins/infra/plugins/events/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "jobs" | "events" | "triggers";

export function QueueView() {
  const [tab, setTab] = useState<Tab>("jobs");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <TabButton active={tab === "jobs"} onClick={() => setTab("jobs")}>
          <MdWorkOutline className="size-4" /> Jobs
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")}>
          <MdBolt className="size-4" /> Events
        </TabButton>
        <TabButton active={tab === "triggers"} onClick={() => setTab("triggers")}>
          Triggers
        </TabButton>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "jobs" && <JobsTab />}
        {tab === "events" && <EventsTab />}
        {tab === "triggers" && <TriggersTab />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ─── Fetch helpers ───────────────────────────────────────────────────────

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

function toastErr(e: unknown, prefix: string) {
  const msg = e instanceof Error ? e.message : String(e);
  toast({ type: "debug", description: `${prefix}: ${msg}`, variant: "error" });
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "in " : "";
  const suffix = ms < 0 ? "" : " ago";
  const s = Math.floor(abs / 1000);
  if (s < 60) return `${sign}${s}s${suffix}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${sign}${m}m${suffix}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${sign}${h}h${suffix}`;
  const d = Math.floor(h / 24);
  return `${sign}${d}d${suffix}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// ─── Jobs tab ────────────────────────────────────────────────────────────

const STATE_STYLES: Record<JobState, string> = {
  pending: "bg-info/10 text-info",
  running: "bg-warning/10 text-warning",
  retrying: "bg-warning/15 text-warning",
  dead: "bg-destructive/10 text-destructive",
};

function JobsTab() {
  const chipFilter = useChipFilter<JobState | "all">("all");
  const [selected, setSelected] = useState<JobRow | null>(null);
  const jobsResult = useResource(jobsListResource);
  const { refetch } = jobsResult;

  const counts = useMemo(
    () => jobsResult.pending ? { pending: 0, running: 0, retrying: 0, dead: 0 } : jobsResult.data.counts,
    [jobsResult],
  );
  const total = counts.pending + counts.running + counts.retrying + counts.dead;
  const visible = useMemo(
    () => jobsResult.pending ? [] : jobsResult.data.rows.filter((r) => chipFilter.matches(r.state)),
    [jobsResult, chipFilter],
  );

  async function retry(id: string) {
    try {
      await jsonFetch(`/api/jobs/${id}/retry`, { method: "POST" });
    } catch (e) {
      toastErr(e, "Retry failed");
    }
  }

  async function cancel(id: string) {
    try {
      await jsonFetch(`/api/jobs/${id}`, { method: "DELETE" });
    } catch (e) {
      toastErr(e, "Cancel failed");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <FilterChip active={chipFilter.value === "all"} onClick={() => chipFilter.setValue("all")}>
          All <span className="opacity-60">{total}</span>
        </FilterChip>
        <FilterChip active={chipFilter.value === "pending"} onClick={() => chipFilter.setValue("pending")}>
          Pending <span className="opacity-60">{counts.pending}</span>
        </FilterChip>
        <FilterChip active={chipFilter.value === "running"} onClick={() => chipFilter.setValue("running")}>
          Running <span className="opacity-60">{counts.running}</span>
        </FilterChip>
        <FilterChip active={chipFilter.value === "retrying"} onClick={() => chipFilter.setValue("retrying")}>
          Retrying <span className="opacity-60">{counts.retrying}</span>
        </FilterChip>
        <FilterChip active={chipFilter.value === "dead"} onClick={() => chipFilter.setValue("dead")}>
          Dead <span className="opacity-60">{counts.dead}</span>
        </FilterChip>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          <MdRefresh className="size-4" /> Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <Empty>No jobs.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b bg-background text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Run at</th>
                <th className="px-3 py-2">Last error</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b hover:bg-accent/30"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-3 py-2">
                    <Badge size="sm" colorClass={STATE_STYLES[r.state]}>
                      {r.state}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.jobName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.attempts}/{r.maxAttempts}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{relativeTime(r.runAt)}</td>
                  <td className="px-3 py-2 text-xs text-destructive">
                    {r.lastError ? truncate(r.lastError.split("\n")[0] ?? "", 60) : ""}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {(r.state === "retrying" || r.state === "dead") && (
                      <Button size="sm" variant="ghost" onClick={() => retry(r.id)}>
                        <MdReplay className="size-3.5" /> Retry
                      </Button>
                    )}
                    {r.state === "pending" && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                        <MdDelete className="size-3.5" /> Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && <JobDrawer job={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function JobDrawer({ job, onClose }: { job: JobRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex h-full w-[560px] flex-col overflow-hidden border-l bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">Job</div>
            <div className="font-mono text-sm">{job.jobName}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
          <Field label="ID">
            <code className="text-xs">{job.id}</code>
          </Field>
          <Field label="State">
            <Badge size="sm" colorClass={STATE_STYLES[job.state]}>
              {job.state}
            </Badge>
          </Field>
          <Field label="Attempts">{job.attempts} / {job.maxAttempts}</Field>
          <Field label="Run at">{new Date(job.runAt).toLocaleString()} ({relativeTime(job.runAt)})</Field>
          {job.lockedAt && (
            <Field label="Locked at">{new Date(job.lockedAt).toLocaleString()}</Field>
          )}
          <Field label="Queue">{job.queueName ?? "(default)"}</Field>
          <Field label="Input">
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(job.input, null, 2)}
            </pre>
          </Field>
          {job.lastError && (
            <Field label="Last error">
              <pre className="max-h-64 overflow-auto rounded bg-destructive/5 p-2 text-xs text-destructive">
                {job.lastError}
              </pre>
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Events tab ──────────────────────────────────────────────────────────

function EventsTab() {
  const emissionsResult = useResource(eventEmissionsResource);
  const { refetch } = emissionsResult;
  const [selected, setSelected] = useState<EmissionRow | null>(null);
  const rows = emissionsResult.pending ? [] : emissionsResult.data.rows;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b px-3 py-2">
        <div className="text-xs text-muted-foreground">
          Capped ring-buffer of last ~1000 emit() calls.
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          <MdRefresh className="size-4" /> Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <Empty>No emissions recorded yet. Emit an event to populate this log.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b bg-background text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Matched</th>
                <th className="px-3 py-2">Payload</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b hover:bg-accent/30"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-3 py-2 text-muted-foreground">{relativeTime(r.emittedAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.eventName}</td>
                  <td className="px-3 py-2">
                    <Badge
                      size="sm"
                      colorClass={
                        r.matchedCount === 0
                          ? "bg-destructive/10 text-destructive"
                          : "bg-success/10 text-success"
                      }
                    >
                      {r.matchedCount}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {truncate(JSON.stringify(r.payload), 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && <EmissionDrawer emission={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function EmissionDrawer({
  emission,
  onClose,
}: {
  emission: EmissionRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-[560px] flex-col overflow-hidden border-l bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">Emission</div>
            <div className="font-mono text-sm">{emission.eventName}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
          <Field label="Emitted at">
            {new Date(emission.emittedAt).toLocaleString()} ({relativeTime(emission.emittedAt)})
          </Field>
          <Field label="Matched triggers">
            {emission.matchedCount === 0 ? (
              <span className="text-destructive">
                0 — no trigger matched this emission.
              </span>
            ) : (
              <ul className="space-y-1 font-mono text-xs">
                {emission.matchedTriggerIds.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            )}
          </Field>
          <Field label="Payload">
            <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(emission.payload, null, 2)}
            </pre>
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─── Triggers tab ────────────────────────────────────────────────────────

function TriggersTab() {
  const triggersResult = useResource(eventTriggersResource);
  const { refetch } = triggersResult;

  const grouped = useMemo(() => {
    const rows = triggersResult.pending ? [] : triggersResult.data.rows;
    const map = new Map<string, TriggerRow[]>();
    for (const r of rows) {
      const list = map.get(r.eventName) ?? [];
      list.push(r);
      map.set(r.eventName, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [triggersResult]);

  async function toggle(id: string, enabled: boolean) {
    try {
      await jsonFetch(`/api/events/triggers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } catch (e) {
      toastErr(e, "Toggle failed");
    }
  }

  async function remove(id: string) {
    try {
      await jsonFetch(`/api/events/triggers/${id}`, { method: "DELETE" });
    } catch (e) {
      toastErr(e, "Delete failed");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b px-3 py-2">
        <div className="text-xs text-muted-foreground">
          Active subscriptions across all registered events.
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          <MdRefresh className="size-4" /> Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {grouped.length === 0 ? (
          <Empty>No active triggers.</Empty>
        ) : (
          <div className="divide-y">
            {grouped.map(([eventName, triggers]) => (
              <div key={eventName}>
                <div className="sticky top-0 border-b bg-muted/50 px-3 py-1.5 text-xs font-semibold">
                  {eventName} <span className="text-muted-foreground">({triggers.length})</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {triggers.map((t) => (
                      <tr key={t.id} className={cn("border-b", !t.enabled && "opacity-60")}>
                        <td className="px-3 py-2 font-mono text-xs">{t.jobName}</td>
                        <td className="px-3 py-2 text-xs">
                          {Object.keys(t.filters).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(t.filters).map(([k, v]) => (
                                <Badge
                                  key={k}
                                  variant="muted"
                                  size="sm"
                                  className="font-mono"
                                >
                                  {k}={v === null ? "*" : JSON.stringify(v)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {Object.keys(t.jobWith).length > 0 && (
                            <code>{truncate(JSON.stringify(t.jobWith), 40)}</code>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {t.oneShot && <span className="text-muted-foreground">oneShot</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {relativeTime(t.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggle(t.id, !t.enabled)}
                          >
                            {t.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                            <MdDelete className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}
