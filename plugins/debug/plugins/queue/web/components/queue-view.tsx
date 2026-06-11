import { useMemo, useState } from "react";
import { MdBolt, MdDelete, MdRefresh, MdReplay, MdWorkOutline } from "react-icons/md";
import { toast } from "@plugins/notifications/web";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { FilterChip, useChipFilter } from "@plugins/primitives/plugins/filter-chips/web";
import { jobsListResource, retryJob, cancelJob, type JobRow, type JobState, type JobsPayload } from "@plugins/infra/plugins/jobs/core";
import { eventEmissionsResource, eventTriggersResource, patchTriggerEndpoint, deleteTriggerEndpoint, type EmissionRow, type TriggerRow, type TriggersPayload } from "@plugins/infra/plugins/events/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { cn } from "@/lib/utils";

type Tab = "jobs" | "events" | "triggers";

const TAB_OPTIONS = [
  { id: "jobs" as Tab, label: "Jobs", icon: <MdWorkOutline className="size-4" /> },
  { id: "events" as Tab, label: "Events", icon: <MdBolt className="size-4" /> },
  { id: "triggers" as Tab, label: "Triggers" },
] as const;

export function QueueView() {
  const [tab, setTab] = useState<Tab>("jobs");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <SegmentedControl
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
          variant="ghost"
        />
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "jobs" && <JobsTab />}
        {tab === "events" && <EventsTab />}
        {tab === "triggers" && <TriggersTab />}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function toastErr(e: unknown, prefix: string) {
  const msg = e instanceof Error ? e.message : String(e);
  toast({ type: "debug", title: prefix, description: msg, variant: "error" });
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
  const jobsResult = useResource(jobsListResource);
  const { refetch } = jobsResult;
  return (
    <ResourceView resource={jobsResult} fallback={<Loading />}>
      {(data) => <JobsTabInner data={data} refetch={refetch} />}
    </ResourceView>
  );
}

function JobsTabInner({ data, refetch }: { data: JobsPayload; refetch: () => Promise<unknown> }) {
  const chipFilter = useChipFilter<JobState | "all">("all");
  const [selected, setSelected] = useState<JobRow | null>(null);

  const counts = useMemo(() => data.counts, [data]);
  const total = counts.pending + counts.running + counts.retrying + counts.dead;
  const visible = useMemo(
    () => data.rows.filter((r) => chipFilter.matches(r.state)),
    [data, chipFilter],
  );

  async function retry(id: string) {
    try {
      await fetchEndpoint(retryJob, { id });
    } catch (e) {
      toastErr(e, "Retry failed");
    }
  }

  async function cancel(id: string) {
    try {
      await fetchEndpoint(cancelJob, { id });
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
          <table className="w-full text-body">
            <thead className="sticky top-0 border-b bg-background text-left text-caption text-muted-foreground">
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
                  <td className="px-3 py-2 font-mono text-caption">{r.jobName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.attempts}/{r.maxAttempts}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{relativeTime(r.runAt)}</td>
                  <td className="px-3 py-2 text-caption text-destructive">
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
      className="fixed inset-0 z-popover flex justify-end bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex h-full w-[560px] flex-col overflow-hidden border-l bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <Text as="div" variant="caption" className="text-muted-foreground">Job</Text>
            <Text as="div" variant="body" className="font-mono">{job.jobName}</Text>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <Text as="div" variant="body" className="flex-1 space-y-4 overflow-auto p-4">
          <Field label="ID">
            <code className="text-caption">{job.id}</code>
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
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-caption">
              {JSON.stringify(job.input, null, 2)}
            </pre>
          </Field>
          {job.lastError && (
            <Field label="Last error">
              <pre className="max-h-64 overflow-auto rounded-md bg-destructive/5 p-2 text-caption text-destructive">
                {job.lastError}
              </pre>
            </Field>
          )}
        </Text>
      </div>
    </div>
  );
}

// ─── Events tab ──────────────────────────────────────────────────────────

function EventsTab() {
  const emissionsResult = useResource(eventEmissionsResource);
  const { refetch } = emissionsResult;
  const [selected, setSelected] = useState<EmissionRow | null>(null);

  if (emissionsResult.pending) return <Loading />;
  const rows = emissionsResult.data.rows;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b px-3 py-2">
        <Text as="div" variant="caption" className="text-muted-foreground">
          Capped ring-buffer of last ~1000 emit() calls.
        </Text>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          <MdRefresh className="size-4" /> Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <Empty>No emissions recorded yet. Emit an event to populate this log.</Empty>
        ) : (
          <table className="w-full text-body">
            <thead className="sticky top-0 border-b bg-background text-left text-caption text-muted-foreground">
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
                  <td className="px-3 py-2 font-mono text-caption">{r.eventName}</td>
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
                  <td className="px-3 py-2 font-mono text-caption text-muted-foreground">
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
    <div className="fixed inset-0 z-popover flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-[560px] flex-col overflow-hidden border-l bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <Text as="div" variant="caption" className="text-muted-foreground">Emission</Text>
            <Text as="div" variant="body" className="font-mono">{emission.eventName}</Text>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <Text as="div" variant="body" className="flex-1 space-y-4 overflow-auto p-4">
          <Field label="Emitted at">
            {new Date(emission.emittedAt).toLocaleString()} ({relativeTime(emission.emittedAt)})
          </Field>
          <Field label="Matched triggers">
            {emission.matchedCount === 0 ? (
              <span className="text-destructive">
                0 — no trigger matched this emission.
              </span>
            ) : (
              <ul className="space-y-1 font-mono text-caption">
                {emission.matchedTriggerIds.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            )}
          </Field>
          <Field label="Payload">
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-caption">
              {JSON.stringify(emission.payload, null, 2)}
            </pre>
          </Field>
        </Text>
      </div>
    </div>
  );
}

// ─── Triggers tab ────────────────────────────────────────────────────────

function TriggersTab() {
  const triggersResult = useResource(eventTriggersResource);
  const { refetch } = triggersResult;
  return (
    <ResourceView resource={triggersResult} fallback={<Loading />}>
      {(data) => <TriggersTabInner data={data} refetch={refetch} />}
    </ResourceView>
  );
}

function TriggersTabInner({ data, refetch }: { data: TriggersPayload; refetch: () => Promise<unknown> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, TriggerRow[]>();
    for (const r of data.rows) {
      const list = map.get(r.eventName) ?? [];
      list.push(r);
      map.set(r.eventName, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  async function toggle(id: string, enabled: boolean) {
    try {
      await fetchEndpoint(patchTriggerEndpoint, { id }, { body: { enabled } });
    } catch (e) {
      toastErr(e, "Toggle failed");
    }
  }

  async function remove(id: string) {
    try {
      await fetchEndpoint(deleteTriggerEndpoint, { id });
    } catch (e) {
      toastErr(e, "Delete failed");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b px-3 py-2">
        <Text as="div" variant="caption" className="text-muted-foreground">
          Active subscriptions across all registered events.
        </Text>
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
                <Text as="div" variant="caption" className="sticky top-0 border-b bg-muted/50 px-3 py-1.5 font-semibold">
                  {eventName} <span className="text-muted-foreground">({triggers.length})</span>
                </Text>
                <table className="w-full text-body">
                  <tbody>
                    {triggers.map((t) => (
                      <tr key={t.id} className={cn("border-b", !t.enabled && "opacity-60")}>
                        <td className="px-3 py-2 font-mono text-caption">{t.jobName}</td>
                        <td className="px-3 py-2 text-caption">
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
                        <td className="px-3 py-2 text-caption text-muted-foreground">
                          {Object.keys(t.jobWith).length > 0 && (
                            <code>{truncate(JSON.stringify(t.jobWith), 40)}</code>
                          )}
                        </td>
                        <td className="px-3 py-2 text-caption">
                          {t.oneShot && <span className="text-muted-foreground">oneShot</span>}
                        </td>
                        <td className="px-3 py-2 text-caption text-muted-foreground">
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
    <Text as="div" variant="body" className="flex h-full items-center justify-center text-muted-foreground">
      {children}
    </Text>
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
      <Text as="div" variant="caption" className="mb-1 font-medium uppercase text-muted-foreground">{label}</Text>
      <div>{children}</div>
    </div>
  );
}
