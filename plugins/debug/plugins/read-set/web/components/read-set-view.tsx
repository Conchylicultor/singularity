import { useMemo, useState, type ReactElement } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { resourcesReadSetEndpoint } from "../../shared/endpoints";
import type { ResourceReadSet } from "../../shared/schema";

// Web-only debug pane consuming `GET /api/resources/_debug`. Everything below is
// derived PURELY client-side from the `resources[].readSet` (the captured
// loader→table index the server records), `resources[].dependsOn` (the
// hand-drawn cascade graph), and `resources[].notifyStats` (notify provenance
// counters). Three sections:
//   A — the captured index, inverted to table → [resource keys].
//   B — the diff vs `dependsOn`, both directions (missing / over-broad edges).
//   C — notify provenance: per-resource hand vs feed counts during the L4
//       parallel run, flagging read-set-gap candidates (hand > 0 && feed === 0).

interface TableEntry {
  table: string;
  readers: string[];
}

interface MissingFlag {
  key: string;
  /** Tables read by R but not covered by any transitive dependsOn upstream. */
  uncovered: string[];
}

interface OverBroadFlag {
  key: string;
  /** Declared upstreams U whose read-set shares no table with R's. */
  upstreams: string[];
}

interface NotifyEntry {
  key: string;
  hand: number;
  feed: number;
  /** hand > 0 && feed === 0 — the feed under-covers what the hand-notify does. */
  gap: boolean;
}

/** Invert every resource's readSet into table → sorted unique reader keys. */
function buildCapturedIndex(resources: ResourceReadSet[]): TableEntry[] {
  const byTable = new Map<string, Set<string>>();
  for (const r of resources) {
    for (const table of r.readSet) {
      let readers = byTable.get(table);
      if (!readers) {
        readers = new Set();
        byTable.set(table, readers);
      }
      readers.add(r.key);
    }
  }
  return [...byTable.entries()]
    .map(([table, readers]) => ({ table, readers: [...readers].sort() }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * Transitive closure of R's `dependsOn` graph: every resource reachable by
 * following dependsOn edges (excluding R itself). Cycle-safe via a visited set.
 */
function transitiveUpstreams(start: string, dependsOn: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...(dependsOn.get(start) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (next === start || out.has(next)) continue;
    out.add(next);
    for (const up of dependsOn.get(next) ?? []) stack.push(up);
  }
  return out;
}

function computeDiff(resources: ResourceReadSet[]): {
  missing: MissingFlag[];
  overBroad: OverBroadFlag[];
} {
  const readsByKey = new Map<string, Set<string>>();
  const dependsOn = new Map<string, string[]>();
  for (const r of resources) {
    readsByKey.set(r.key, new Set(r.readSet));
    dependsOn.set(r.key, r.dependsOn);
  }

  const missing: MissingFlag[] = [];
  const overBroad: OverBroadFlag[] = [];

  for (const r of resources) {
    const reads = readsByKey.get(r.key)!;
    if (reads.size === 0) continue; // loader never ran — nothing to compare

    // (a) MISSING EDGES: tables R reads that no transitive dependsOn upstream reads.
    const covered = new Set<string>();
    for (const up of transitiveUpstreams(r.key, dependsOn)) {
      for (const t of readsByKey.get(up) ?? []) covered.add(t);
    }
    const uncovered = [...reads].filter((t) => !covered.has(t)).sort();
    if (uncovered.length > 0) missing.push({ key: r.key, uncovered });

    // (b) OVER-BROAD EDGES: declared upstream U sharing no read table with R.
    const overBroadUps = r.dependsOn
      .filter((u) => {
        const upReads = readsByKey.get(u);
        if (!upReads || upReads.size === 0) return false; // U's loader never ran — can't judge
        for (const t of reads) if (upReads.has(t)) return false; // shares a table
        return true;
      })
      .sort();
    if (overBroadUps.length > 0) overBroad.push({ key: r.key, upstreams: overBroadUps });
  }

  return { missing, overBroad };
}

/**
 * Project each resource's notify provenance counters into a sorted list, with
 * gap candidates (hand > 0 && feed === 0) first. Resources that have never
 * notified (hand === 0 && feed === 0) are dropped — nothing to compare yet.
 */
function buildNotifyEntries(resources: ResourceReadSet[]): NotifyEntry[] {
  return resources
    .map((r) => ({
      key: r.key,
      hand: r.notifyStats.hand,
      feed: r.notifyStats.feed,
      gap: r.notifyStats.hand > 0 && r.notifyStats.feed === 0,
    }))
    .filter((e) => e.hand > 0 || e.feed > 0)
    .sort((a, b) => {
      if (a.gap !== b.gap) return a.gap ? -1 : 1; // gaps first
      return a.key.localeCompare(b.key);
    });
}

export function ReadSetView(): ReactElement {
  const { data } = useEndpoint(resourcesReadSetEndpoint, {}, { refetchInterval: 5000 });

  const resources = useMemo(() => data?.resources ?? [], [data]);
  const captured = useMemo(() => buildCapturedIndex(resources), [resources]);
  const { missing, overBroad } = useMemo(() => computeDiff(resources), [resources]);
  const notifyEntries = useMemo(() => buildNotifyEntries(resources), [resources]);

  if (!data) {
    return (
      <Scroll className="h-full p-lg">
        <Loading variant="rows" />
      </Scroll>
    );
  }

  return (
    <Scroll className="h-full p-lg">
      <Stack gap="xl">
        <Caveat />
        <NotifyProvenanceSection entries={notifyEntries} />
        <CapturedIndexSection entries={captured} />
        <DiffSection missing={missing} overBroad={overBroad} />
      </Stack>
    </Scroll>
  );
}

function Caveat(): ReactElement {
  return (
    <Placeholder tone="muted">
      Heuristic — direct notify() sites are not modeled in this phase (L4). A
      "missing edge" may be covered by a self-notify() rather than a true bug;
      over-broad flags ignore affectedMap scoping. Only loaders that have run
      since boot appear.
    </Placeholder>
  );
}

// ── Section A: captured table → [resources] index ──────────────────────────

function CapturedIndexSection({ entries }: { entries: TableEntry[] }): ReactElement {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (e) =>
        e.table.toLowerCase().includes(needle) ||
        e.readers.some((r) => r.toLowerCase().includes(needle)),
    );
  }, [entries, query]);

  return (
    <Stack as="section" gap="sm">
      <SectionLabel>
        Captured index <span className="opacity-60">{entries.length} tables</span>
      </SectionLabel>
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by table or resource…"
      />
      {entries.length === 0 ? (
        <Text variant="caption" tone="muted">No tables captured yet — browse to run loaders.</Text>
      ) : (
        <Stack gap="sm">
          {filtered.map((e) => (
            <ChipRow
              key={e.table}
              label={e.table}
              count={e.readers.length}
              chips={e.readers.map((r) => ({ key: r, text: r }))}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * One labeled row: a mono identity on the left, a count on the right, and a
 * wrapping Cluster of identity chips below. Shared by Section A and B so a long
 * chip list wraps (Cluster) rather than truncating in a single-line slot.
 */
function ChipRow({
  label,
  count,
  chips,
  variant,
}: {
  label: string;
  count: number;
  chips: { key: string; text: string }[];
  variant?: "warning";
}): ReactElement {
  return (
    <Stack gap="2xs">
      <Stack direction="row" gap="sm" align="baseline" justify="between">
        <Text variant="caption" className="font-mono">{label}</Text>
        <Text as="span" variant="caption" tone="muted" className="tabular-nums">{count}</Text>
      </Stack>
      <Cluster gap="2xs">
        {chips.map((c) => (
          <Badge key={c.key} variant={variant} size="sm" mono>{c.text}</Badge>
        ))}
      </Cluster>
    </Stack>
  );
}

// ── Section C: notify provenance (hand vs feed, L4 parallel run) ────────────

function NotifyProvenanceSection({ entries }: { entries: NotifyEntry[] }): ReactElement {
  const gaps = useMemo(() => entries.filter((e) => e.gap).length, [entries]);

  return (
    <Stack as="section" gap="sm">
      <SectionLabel>
        Notify provenance — hand vs feed{" "}
        <span className="opacity-60">
          {entries.length} active{gaps > 0 ? ` · ${gaps} gap` : ""}
        </span>
      </SectionLabel>
      {entries.length === 0 ? (
        <Text variant="caption" tone="muted">
          No notifies recorded yet — exercise a mutation to populate counts.
        </Text>
      ) : (
        <Stack gap="2xs">
          {entries.map((e) => (
            <NotifyRow key={e.key} entry={e} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * One resource row: mono key on the left, hand/feed count badges on the right,
 * with a destructive "read-set gap" flag when the feed never covered a table the
 * hand-notify did (hand > 0 && feed === 0).
 */
function NotifyRow({ entry }: { entry: NotifyEntry }): ReactElement {
  return (
    <Stack direction="row" gap="sm" align="baseline" justify="between">
      <Text variant="caption" className="font-mono">{entry.key}</Text>
      <Cluster gap="2xs">
        {entry.gap ? <Badge variant="destructive" size="sm">read-set gap</Badge> : null}
        <Badge variant={entry.gap ? "warning" : "muted"} size="sm" mono>
          hand {entry.hand}
        </Badge>
        <Badge variant={entry.feed > 0 ? "success" : "muted"} size="sm" mono>
          feed {entry.feed}
        </Badge>
      </Cluster>
    </Stack>
  );
}

// ── Section B: diff vs dependsOn (both directions) ──────────────────────────

function DiffSection({
  missing,
  overBroad,
}: {
  missing: MissingFlag[];
  overBroad: OverBroadFlag[];
}): ReactElement {
  return (
    <Stack as="section" gap="lg">
      <SectionLabel>Diff vs dependsOn</SectionLabel>

      <Stack gap="sm">
        <SectionLabel>
          Missing edges — latent stale-UI{" "}
          <span className="opacity-60">{missing.length}</span>
        </SectionLabel>
        {missing.length === 0 ? (
          <Text variant="caption" tone="muted">No uncovered tables — every read is reachable through a dependsOn upstream.</Text>
        ) : (
          <Stack gap="sm">
            {missing.map((m) => (
              <ChipRow
                key={m.key}
                label={m.key}
                count={m.uncovered.length}
                variant="warning"
                chips={m.uncovered.map((t) => ({ key: t, text: t }))}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <Stack gap="sm">
        <SectionLabel>
          Over-broad edges — cascade amplification{" "}
          <span className="opacity-60">{overBroad.length}</span>
        </SectionLabel>
        {overBroad.length === 0 ? (
          <Text variant="caption" tone="muted">No over-broad edges — every declared upstream shares a read table.</Text>
        ) : (
          <Stack gap="sm">
            {overBroad.map((o) => (
              <ChipRow
                key={o.key}
                label={o.key}
                count={o.upstreams.length}
                variant="warning"
                chips={o.upstreams.map((u) => ({ key: u, text: `${u} →` }))}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
