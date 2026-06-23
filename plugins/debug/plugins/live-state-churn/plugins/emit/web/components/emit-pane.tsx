import { useEffect, useMemo, useState } from "react";
import {
  useEndpoint,
  useEndpointMutation,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { MdBolt } from "react-icons/md";
import {
  DEFAULT_EMIT_DURATION_MS,
  MAX_EMIT_RATE,
} from "../../core";
import {
  startEmit,
  stopEmit,
  getEmitStatus,
  listResourcesForEmit,
} from "../../shared/endpoints";

// Status polls while a session is active so ticks/lastSubscriberCount/remaining
// stay live. This is a debug-pane read of a server-owned in-memory snapshot — the
// emitter itself is the push generator; there is no live-state resource to
// subscribe to for its own status, so a slow refetch is the simplest faithful
// read. The interval only runs while the pane is mounted (debug-only surface).
const STATUS_REFETCH_MS = 1000;

export function EmitPane() {
  const { data: resourcesData } = useEndpoint(listResourcesForEmit, {});
  const status = useEndpoint(getEmitStatus, {}, {
    refetchInterval: STATUS_REFETCH_MS,
  });
  const active = status.data?.active ?? false;

  const start = useEndpointMutation(startEmit, { invalidates: [getEmitStatus] });
  const stop = useEndpointMutation(stopEmit, { invalidates: [getEmitStatus] });

  // Only keyed resources with subscribers can produce an OBSERVABLE no-op push —
  // an empty-diff push to nobody is unobservable. Sort by subscriber count desc.
  const candidates = useMemo(() => {
    const all = resourcesData?.resources ?? [];
    return all
      .filter((r) => r.mode === "keyed" && r.subscribers > 0)
      .sort((a, b) => b.subscribers - a.subscribers);
  }, [resourcesData]);

  const [selectedKey, setSelectedKey] = useState<string>("");
  const [manualKey, setManualKey] = useState<string>("");
  const [rate, setRate] = useState<number>(10);
  const [durationMin, setDurationMin] = useState<number>(
    DEFAULT_EMIT_DURATION_MS / 60_000,
  );

  // Ticks ~1/s so StatusView's remaining-time countdown stays live without
  // calling Date.now() inside render (React Compiler purity requirement).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => { setNowMs(Date.now()); }, 1000);
    return () => { clearInterval(id); };
  }, []);

  // Manual key wins when typed (free-text fallback for an off-screen resource).
  const effectiveKey = manualKey.trim() || selectedKey;

  const dropdownItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const r of candidates) items[r.key] = r.key;
    return items;
  }, [candidates]);

  const errorMessage =
    (start.error && getEndpointErrorMessage(start.error)) ||
    (stop.error && getEndpointErrorMessage(stop.error)) ||
    null;

  return (
    <Scroll axis="y" fill>
      <Inset pad="lg">
        <Stack gap="xl">
          <Stack as="section" gap="sm">
            <Stack direction="row" gap="sm" align="center">
              <MdBolt className="size-4 text-muted-foreground" />
              <SectionLabel>Synthetic no-op push emitter</SectionLabel>
            </Stack>
            <Text variant="caption" tone="muted">
              Drives N no-op live-state pushes/sec for one resource through the
              real change-feed code path, so re-render / DOM-churn bugs reproduce
              deterministically. Auto-stops after the duration below; only keyed
              resources with live subscribers produce an observable push.
            </Text>
          </Stack>

          <Stack as="section" gap="sm">
            <SectionLabel>Resource</SectionLabel>
            <Select
              items={dropdownItems}
              value={selectedKey || null}
              onValueChange={(v: string | null) => {
                setSelectedKey(v ?? "");
                setManualKey("");
              }}
              disabled={active || candidates.length === 0}
            >
              <SelectTrigger aria-label="Resource key" className="w-full">
                <SelectValue>
                  {(v: string | null) => v ?? "Pick a subscribed keyed resource…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {candidates.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {`${r.key} · ${r.subscribers} sub${r.subscribers === 1 ? "" : "s"}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
              placeholder="…or type any resource key (off-screen / no subscribers)"
              disabled={active}
              aria-label="Manual resource key"
            />
            {candidates.length === 0 ? (
              <Text variant="caption" tone="muted">
                No keyed resources with live subscribers right now — open a view
                that renders one, or type a key above.
              </Text>
            ) : null}
          </Stack>

          <Stack as="section" gap="sm">
            <SectionLabel>Rate &amp; duration</SectionLabel>
            <Stack direction="row" gap="md" align="end" wrap>
              <Stack gap="2xs">
                <Text variant="caption" tone="muted">
                  Pushes / sec (max {MAX_EMIT_RATE})
                </Text>
                <Input
                  type="number"
                  min={0.1}
                  max={MAX_EMIT_RATE}
                  step={0.1}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  disabled={active}
                  aria-label="Pushes per second"
                  className="w-32"
                />
              </Stack>
              <Stack gap="2xs">
                <Text variant="caption" tone="muted">
                  Auto-stop after (minutes)
                </Text>
                <Input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  disabled={active}
                  aria-label="Auto-stop minutes"
                  className="w-32"
                />
              </Stack>
            </Stack>
          </Stack>

          <Stack as="section" gap="sm">
            <Stack direction="row" gap="sm" align="center">
              {active ? (
                <Button
                  variant="destructive"
                  onClick={() => void stop.mutateAsync({})}
                  disabled={stop.isPending}
                >
                  {stop.isPending ? "Stopping…" : "Stop"}
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={() =>
                    void start.mutateAsync({
                      body: {
                        key: effectiveKey,
                        rate,
                        durationMs: Math.round(durationMin * 60_000),
                      },
                    })
                  }
                  disabled={start.isPending || !effectiveKey}
                >
                  {start.isPending ? "Starting…" : "Start"}
                </Button>
              )}
            </Stack>
            {errorMessage ? (
              <Placeholder tone="error">{errorMessage}</Placeholder>
            ) : null}
          </Stack>

          <Stack as="section" gap="sm">
            <SectionLabel>Status</SectionLabel>
            <StatusView status={status.data} nowMs={nowMs} />
          </Stack>
        </Stack>
      </Inset>
    </Scroll>
  );
}

function StatusView({
  status,
  nowMs,
}: {
  status:
    | {
        active: boolean;
        key: string | null;
        rate: number;
        endsAtMs: number | null;
        ticks: number;
        lastSubscriberCount: number;
      }
    | undefined;
  nowMs: number;
}) {
  if (!status) return <Placeholder>Loading…</Placeholder>;
  if (!status.active) {
    return (
      <Text variant="caption" tone="muted">
        Idle. {status.ticks > 0 ? `Last session fired ${status.ticks} ticks.` : ""}
      </Text>
    );
  }

  const remainingMs = status.endsAtMs ? status.endsAtMs - nowMs : 0;
  const remainingS = Math.max(0, Math.round(remainingMs / 1000));
  const noSubscribers = status.lastSubscriberCount === 0;

  return (
    <Stack gap="sm">
      <Stack direction="row" gap="sm" align="center" wrap>
        <Badge variant="success">Emitting</Badge>
        <Badge variant="muted" mono>
          {status.key ?? "—"}
        </Badge>
        <Badge variant="muted">{status.rate}/s</Badge>
        <Badge variant={noSubscribers ? "warning" : "info"}>
          {`${status.lastSubscriberCount} subscriber${status.lastSubscriberCount === 1 ? "" : "s"}`}
        </Badge>
      </Stack>
      <Text variant="caption" tone="muted">
        {`${status.ticks} ticks scheduled · auto-stops in ${remainingS}s`}
      </Text>
      {noSubscribers ? (
        <Placeholder tone="error">
          Nobody subscribed to this key — no churn is observable. Open a view that
          renders this resource, or pick one with live subscribers.
        </Placeholder>
      ) : null}
    </Stack>
  );
}
