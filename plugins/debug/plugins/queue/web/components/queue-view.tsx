import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, useState } from "react";
import { MdBolt, MdDelete, MdHeartBroken, MdRefresh, MdReplay, MdWorkOutline } from "react-icons/md";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { FilterChip, useChipFilter } from "@plugins/primitives/plugins/filter-chips/web";
import { jobsListResource, deadJobsResource, retryJob, cancelJob, type JobRow, type JobState, type JobsPayload, type DeadJobRow, type DeadJobsPayload } from "@plugins/infra/plugins/jobs/core";
import { eventEmissionsResource, eventTriggersResource, patchTriggerEndpoint, deleteTriggerEndpoint, type EmissionRow, type TriggerRow, type TriggersPayload } from "@plugins/infra/plugins/events/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

type Tab = "jobs" | "dead" | "events" | "triggers";

const TAB_OPTIONS = [
  { id: "jobs" as Tab, label: "Jobs", icon: <MdWorkOutline className="size-4" /> },
  { id: "dead" as Tab, label: "Dead", icon: <MdHeartBroken className="size-4" /> },
  { id: "events" as Tab, label: "Events", icon: <MdBolt className="size-4" /> },
  { id: "triggers" as Tab, label: "Triggers" },
] as const;

export function QueueView() {
  const [tab, setTab] = useState<Tab>("jobs");

  return (
    <Stack gap="none" className="h-full">
      <Stack direction="row" gap="xs" align="center" className="border-b px-md py-sm">
        <SegmentedControl
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
          variant="ghost"
        />
      </Stack>
      <Scroll axis="both" fill>
        {tab === "jobs" && <JobsTab />}
        {tab === "dead" && <DeadTab />}
        {tab === "events" && <EventsTab />}
        {tab === "triggers" && <TriggersTab />}
      </Scroll>
    </Stack>
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
    <Stack gap="none" className="h-full">
      <Frame
        className="border-b px-md py-sm"
        content={
          <Stack direction="row" gap="xs" align="center">
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
          </Stack>
        }
        trailing={
          <Button variant="ghost" onClick={() => refetch()}>
            <MdRefresh className="size-4" /> Refresh
          </Button>
        }
      />
      <Scroll axis="both" fill>
        {visible.length === 0 ? (
          <Empty>No jobs.</Empty>
        ) : (
          <table className="w-full text-body">
            <Sticky as="thead" className="border-b bg-background text-left text-caption text-muted-foreground">
              <tr>
                <th className="px-md py-sm">State</th>
                <th className="px-md py-sm">Job</th>
                <th className="px-md py-sm">Attempts</th>
                <th className="px-md py-sm">Run at</th>
                <th className="px-md py-sm">Last error</th>
                <th className="px-md py-sm">Actions</th>
              </tr>
            </Sticky>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b hover:bg-accent/30"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-md py-sm">
                    <Badge colorClass={STATE_STYLES[r.state]}>
                      {r.state}
                    </Badge>
                  </td>
                  <td className="px-md py-sm font-mono text-caption">{r.jobName}</td>
                  <td className="px-md py-sm tabular-nums">
                    {r.attempts}/{r.maxAttempts}
                  </td>
                  <td className="px-md py-sm text-muted-foreground">{relativeTime(r.runAt)}</td>
                  <td className="px-md py-sm text-caption text-destructive">
                    {r.lastError ? truncate(r.lastError.split("\n")[0] ?? "", 60) : ""}
                  </td>
                  <td className="px-md py-sm" onClick={(e) => e.stopPropagation()}>
                    {(r.state === "retrying" || r.state === "dead") && (
                      <Button variant="ghost" onClick={() => retry(r.id)}>
                        <MdReplay className="size-3.5" /> Retry
                      </Button>
                    )}
                    {r.state === "pending" && (
                      <Button variant="ghost" onClick={() => cancel(r.id)}>
                        <MdDelete className="size-3.5" /> Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Scroll>
      {selected && <JobDrawer job={selected} onClose={() => setSelected(null)} />}
    </Stack>
  );
}

/** Right-pinned full-height drawer over a viewport scrim. */
function Drawer({
  onClose,
  header,
  children,
}: {
  onClose: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ViewportOverlay layer="popover" className="bg-black/30" onClick={onClose}>
      <Stack gap="none" direction="row" justify="end" className="h-full">
        <Clip
          className="h-full w-[560px] border-l bg-background"
          onClick={(e) => e.stopPropagation()}
        >
          <Stack gap="none" className="h-full">
            <Frame
              className="border-b px-lg py-md"
              content={header}
              trailing={
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              }
            />
            <Scroll fill className="p-lg">
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- vertical rhythm between Field rows on a scrollable Text drawer body; not a plain flex container */}
              <Text as="div" variant="body" className="space-y-4">
                {children}
              </Text>
            </Scroll>
          </Stack>
        </Clip>
      </Stack>
    </ViewportOverlay>
  );
}

function JobDrawer({ job, onClose }: { job: JobRow; onClose: () => void }) {
  return (
    <Drawer
      onClose={onClose}
      header={
        <div>
          <Text as="div" variant="caption" className="text-muted-foreground">Job</Text>
          <Text as="div" variant="body" className="font-mono">{job.jobName}</Text>
        </div>
      }
    >
      <Field label="ID">
        <code className="text-caption">{job.id}</code>
      </Field>
      <Field label="State">
        <Badge colorClass={STATE_STYLES[job.state]}>
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
        <Scroll as="pre" axis="both" className="max-h-64 rounded-md bg-muted p-sm text-caption">
          {JSON.stringify(job.input, null, 2)}
        </Scroll>
      </Field>
      {job.lastError && (
        <Field label="Last error">
          <Scroll as="pre" axis="both" className="max-h-64 rounded-md bg-destructive/5 p-sm text-caption text-destructive">
            {job.lastError}
          </Scroll>
        </Field>
      )}
    </Drawer>
  );
}

// ─── Dead tab ──────────────────────────────────────────────────────────────

function DeadTab() {
  const deadResult = useResource(deadJobsResource);
  const { refetch } = deadResult;
  return (
    <ResourceView resource={deadResult} fallback={<Loading />}>
      {(data) => <DeadTabInner data={data} refetch={refetch} />}
    </ResourceView>
  );
}

function DeadTabInner({ data, refetch }: { data: DeadJobsPayload; refetch: () => Promise<unknown> }) {
  const [selected, setSelected] = useState<DeadJobRow | null>(null);
  return (
    <Stack gap="none" className="h-full">
      <Frame
        className="border-b px-md py-sm"
        content={
          <Text as="div" variant="caption" className="text-muted-foreground">
            Permanently-failed jobs archived from the queue (bounded; GC'd hourly).
          </Text>
        }
        trailing={
          <Button variant="ghost" onClick={() => refetch()}>
            <MdRefresh className="size-4" /> Refresh
          </Button>
        }
      />
      <Scroll axis="both" fill>
        {data.rows.length === 0 ? (
          <Empty>No dead jobs. Permanently-failed jobs are archived here.</Empty>
        ) : (
          <table className="w-full text-body">
            <Sticky as="thead" className="border-b bg-background text-left text-caption text-muted-foreground">
              <tr>
                <th className="px-md py-sm">Job</th>
                <th className="px-md py-sm">Attempts</th>
                <th className="px-md py-sm">Last error</th>
                <th className="px-md py-sm">Died</th>
              </tr>
            </Sticky>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b hover:bg-accent/30"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-md py-sm font-mono text-caption">{r.jobName}</td>
                  <td className="px-md py-sm tabular-nums">
                    {r.attempts}/{r.maxAttempts}
                  </td>
                  <td className="px-md py-sm text-caption text-destructive">
                    {r.lastError ? truncate(r.lastError.split("\n")[0] ?? "", 60) : ""}
                  </td>
                  <td className="px-md py-sm text-muted-foreground">
                    {r.diedAt ? relativeTime(r.diedAt) : relativeTime(r.archivedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Scroll>
      {selected && <DeadJobDrawer job={selected} onClose={() => setSelected(null)} />}
    </Stack>
  );
}

function DeadJobDrawer({ job, onClose }: { job: DeadJobRow; onClose: () => void }) {
  return (
    <Drawer
      onClose={onClose}
      header={
        <div>
          <Text as="div" variant="caption" className="text-muted-foreground">Dead job</Text>
          <Text as="div" variant="body" className="font-mono">{job.jobName}</Text>
        </div>
      }
    >
      <Field label="ID">
        <code className="text-caption">{job.id}</code>
      </Field>
      <Field label="Attempts">{job.attempts} / {job.maxAttempts}</Field>
      <Field label="Died at">
        {job.diedAt ? `${new Date(job.diedAt).toLocaleString()} (${relativeTime(job.diedAt)})` : "(unknown)"}
      </Field>
      <Field label="Archived at">
        {new Date(job.archivedAt).toLocaleString()} ({relativeTime(job.archivedAt)})
      </Field>
      <Field label="Input">
        <Scroll as="pre" axis="both" className="max-h-64 rounded-md bg-muted p-sm text-caption">
          {JSON.stringify(job.input, null, 2)}
        </Scroll>
      </Field>
      {job.lastError && (
        <Field label="Last error">
          <Scroll as="pre" axis="both" className="max-h-64 rounded-md bg-destructive/5 p-sm text-caption text-destructive">
            {job.lastError}
          </Scroll>
        </Field>
      )}
    </Drawer>
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
    <Stack gap="none" className="h-full">
      <Frame
        className="border-b px-md py-sm"
        content={
          <Text as="div" variant="caption" className="text-muted-foreground">
            Capped ring-buffer of last ~1000 emit() calls.
          </Text>
        }
        trailing={
          <Button variant="ghost" onClick={() => refetch()}>
            <MdRefresh className="size-4" /> Refresh
          </Button>
        }
      />
      <Scroll axis="both" fill>
        {rows.length === 0 ? (
          <Empty>No emissions recorded yet. Emit an event to populate this log.</Empty>
        ) : (
          <table className="w-full text-body">
            <Sticky as="thead" className="border-b bg-background text-left text-caption text-muted-foreground">
              <tr>
                <th className="px-md py-sm">Time</th>
                <th className="px-md py-sm">Event</th>
                <th className="px-md py-sm">Matched</th>
                <th className="px-md py-sm">Payload</th>
              </tr>
            </Sticky>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b hover:bg-accent/30"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-md py-sm text-muted-foreground">{relativeTime(r.emittedAt)}</td>
                  <td className="px-md py-sm font-mono text-caption">{r.eventName}</td>
                  <td className="px-md py-sm">
                    <Badge
                      colorClass={
                        r.matchedCount === 0
                          ? "bg-destructive/10 text-destructive"
                          : "bg-success/10 text-success"
                      }
                    >
                      {r.matchedCount}
                    </Badge>
                  </td>
                  <td className="px-md py-sm font-mono text-caption text-muted-foreground">
                    {truncate(JSON.stringify(r.payload), 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Scroll>
      {selected && <EmissionDrawer emission={selected} onClose={() => setSelected(null)} />}
    </Stack>
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
    <Drawer
      onClose={onClose}
      header={
        <div>
          <Text as="div" variant="caption" className="text-muted-foreground">Emission</Text>
          <Text as="div" variant="body" className="font-mono">{emission.eventName}</Text>
        </div>
      }
    >
      <Field label="Emitted at">
        {new Date(emission.emittedAt).toLocaleString()} ({relativeTime(emission.emittedAt)})
      </Field>
      <Field label="Matched triggers">
        {emission.matchedCount === 0 ? (
          <span className="text-destructive">
            0 — no trigger matched this emission.
          </span>
        ) : (
          // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical rhythm between <li> rows on a semantic <ul>; converting to a flex Stack would change list semantics
          <ul className="space-y-1 font-mono text-caption">
            {emission.matchedTriggerIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Payload">
        <Scroll as="pre" axis="both" className="max-h-96 rounded-md bg-muted p-sm text-caption">
          {JSON.stringify(emission.payload, null, 2)}
        </Scroll>
      </Field>
    </Drawer>
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
  const [danglingOnly, setDanglingOnly] = useState(false);

  const danglingCount = useMemo(
    () => data.rows.filter((r) => r.dangling).length,
    [data],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, TriggerRow[]>();
    for (const r of data.rows) {
      if (danglingOnly && !r.dangling) continue;
      const list = map.get(r.eventName) ?? [];
      list.push(r);
      map.set(r.eventName, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data, danglingOnly]);

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
    <Stack gap="none" className="h-full">
      <Frame
        className="border-b px-md py-sm"
        content={
          <Stack direction="row" gap="xs" align="center">
            <Text as="div" variant="caption" className="text-muted-foreground">
              Active subscriptions across all registered events.
            </Text>
            {danglingCount > 0 && (
              <FilterChip active={danglingOnly} onClick={() => setDanglingOnly((v) => !v)}>
                <span className="text-destructive">Dangling</span>{" "}
                <span className="opacity-60">{danglingCount}</span>
              </FilterChip>
            )}
          </Stack>
        }
        trailing={
          <Button variant="ghost" onClick={() => refetch()}>
            <MdRefresh className="size-4" /> Refresh
          </Button>
        }
      />
      <Scroll axis="both" fill>
        {grouped.length === 0 ? (
          <Empty>No active triggers.</Empty>
        ) : (
          <div className="divide-y">
            {grouped.map(([eventName, triggers]) => (
              <div key={eventName}>
                <Sticky className="border-b bg-muted/50">
                  <Text as="div" variant="caption" className="px-md py-xs font-semibold">
                    {eventName} <span className="text-muted-foreground">({triggers.length})</span>
                  </Text>
                </Sticky>
                <table className="w-full text-body">
                  <tbody>
                    {triggers.map((t) => (
                      <tr key={t.id} className={cn("border-b", !t.enabled && "opacity-60")}>
                        <td className="px-md py-sm font-mono text-caption">
                          <Inline gap="xs">
                            {t.jobName}
                            {t.dangling && (
                              <Badge colorClass="bg-destructive/10 text-destructive">
                                dangling
                              </Badge>
                            )}
                          </Inline>
                        </td>
                        <td className="px-md py-sm text-caption">
                          {Object.keys(t.filters).length > 0 && (
                            <Cluster gap="xs">
                              {Object.entries(t.filters).map(([k, v]) => (
                                <Badge
                                  key={k}
                                  variant="muted"
                                  className="font-mono"
                                >
                                  {k}={v === null ? "*" : JSON.stringify(v)}
                                </Badge>
                              ))}
                            </Cluster>
                          )}
                        </td>
                        <td className="px-md py-sm text-caption text-muted-foreground">
                          {Object.keys(t.jobWith).length > 0 && (
                            <code>{truncate(JSON.stringify(t.jobWith), 40)}</code>
                          )}
                        </td>
                        <td className="px-md py-sm text-caption">
                          {t.oneShot && <span className="text-muted-foreground">oneShot</span>}
                        </td>
                        <td className="px-md py-sm text-caption text-muted-foreground">
                          {relativeTime(t.createdAt)}
                        </td>
                        <td className="px-md py-sm text-right">
                          <Button
                            variant="ghost"
                            onClick={() => toggle(t.id, !t.enabled)}
                          >
                            {t.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button variant="ghost" onClick={() => remove(t.id)}>
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
      </Scroll>
    </Stack>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Center className="h-full">
      <Text as="div" variant="body" className="text-muted-foreground">
        {children}
      </Text>
    </Center>
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
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off label-to-content gap on a Text element inside a field row */}
      <Text as="div" variant="caption" className="mb-1 font-medium uppercase text-muted-foreground">{label}</Text>
      <div>{children}</div>
    </div>
  );
}
