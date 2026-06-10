import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  useNotificationsClient,
  type ChannelStatuses,
  type DebugSnapshot,
  type DebugSub,
  type LeaderInfo,
} from "@plugins/primitives/plugins/live-state/web";
import type { WsStatus } from "@plugins/primitives/plugins/networking/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { TruncatingText } from "@plugins/primitives/plugins/truncating-text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";

/** Tailwind dot color per socket state — green=healthy, amber=transient, red=dead. */
const SOCKET_DOT: Record<WsStatus, string> = {
  open: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  closed: "bg-destructive",
};

export function LiveStateHealth(): ReactElement {
  const client = useNotificationsClient();
  // subscribeDebug fires on any sub/version/socket/leader change; bump a counter
  // to re-read the snapshot. RelativeTime self-ticks for age, so no manual timer.
  const [, bump] = useState(0);
  useEffect(() => client.subscribeDebug(() => bump((n) => n + 1)), [client]);

  const snapshot: DebugSnapshot = client.debugSnapshot();

  // Default sort: most-recently-updated first — the freshest activity (and, by
  // contrast, the longest-stale subs at the bottom) is what a wedge hunt cares about.
  const subs = useMemo(
    () => [...snapshot.subs].sort((a, b) => b.lastAppliedAt - a.lastAppliedAt),
    [snapshot.subs],
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <SocketsSection sockets={snapshot.sockets} />
      <LeaderSection leader={snapshot.leader} />
      <ResourcesSection subs={subs} />
    </div>
  );
}

function SocketsSection({ sockets }: { sockets: ChannelStatuses }): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Sockets</SectionLabel>
      <div className="flex flex-col gap-1.5">
        <SocketRow label="Worktree" status={sockets.worktree} />
        <SocketRow label="Central" status={sockets.central} />
      </div>
    </section>
  );
}

function SocketRow({ label, status }: { label: string; status: WsStatus }): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <StatusDot colorClass={SOCKET_DOT[status]} size="md" />
      <Text variant="body" className="w-24 shrink-0">{label}</Text>
      <Text
        variant="caption"
        tone={status === "open" ? "muted" : "destructive"}
      >
        {status}
      </Text>
    </div>
  );
}

function LeaderSection({
  leader,
}: {
  leader: { worktree: LeaderInfo; central: LeaderInfo };
}): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Leader</SectionLabel>
      <div className="flex flex-col gap-1.5">
        <LeaderRow label="Worktree" info={leader.worktree} />
        <LeaderRow label="Central" info={leader.central} />
      </div>
    </section>
  );
}

function LeaderRow({ label, info }: { label: string; info: LeaderInfo }): ReactElement {
  // No leader is the prime wedge signal — surface it in error tone, loudly.
  const state = info.isLeader
    ? { text: "this tab is leader", tone: "muted" as const, dot: "bg-success" }
    : info.hasLeader
      ? { text: "follower (leader elsewhere)", tone: "muted" as const, dot: "bg-success" }
      : { text: "NO LEADER", tone: "destructive" as const, dot: "bg-destructive" };
  return (
    <div className="flex items-center gap-2">
      <StatusDot colorClass={state.dot} size="md" />
      <Text variant="body" className="w-24 shrink-0">{label}</Text>
      <Text variant="caption" tone={state.tone}>{state.text}</Text>
    </div>
  );
}

function ResourcesSection({ subs }: { subs: DebugSub[] }): ReactElement {
  return (
    <section className="flex min-h-0 flex-col gap-2">
      <SectionLabel>
        Resources <span className="opacity-60">{subs.length}</span>
      </SectionLabel>
      {subs.length === 0 ? (
        <Text variant="caption" tone="muted">No active subscriptions.</Text>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center gap-3 border-b py-1.5">
            <HeadCell className="flex-[2]">Key</HeadCell>
            <HeadCell className="flex-[2]">Params</HeadCell>
            <HeadCell className="w-16 text-right">Version</HeadCell>
            <HeadCell className="w-24 text-right">Last update</HeadCell>
            <HeadCell className="w-14 text-right">Refs</HeadCell>
            <HeadCell className="w-20">Socket</HeadCell>
          </div>
          {subs.map((sub) => (
            <ResourceRow key={`${sub.socket}:${sub.key}:${sub.paramsKey}`} sub={sub} />
          ))}
        </div>
      )}
    </section>
  );
}

function HeadCell({ children, className }: { children: React.ReactNode; className?: string }): ReactElement {
  return (
    <SectionLabel className={className}>{children}</SectionLabel>
  );
}

function ResourceRow({ sub }: { sub: DebugSub }): ReactElement {
  return (
    <div className="flex items-center gap-3 border-b border-border/40 py-1.5">
      <TruncatingText className="flex-[2]">
        <Text variant="caption">{sub.key}</Text>
      </TruncatingText>
      <TruncatingText className="flex-[2]" title={sub.paramsKey}>
        <Text variant="caption" tone="muted">{sub.paramsKey}</Text>
      </TruncatingText>
      <Text variant="caption" tone="muted" className="w-16 text-right tabular-nums">
        {sub.version}
      </Text>
      <Text variant="caption" tone="muted" className="w-24 text-right tabular-nums">
        {sub.lastAppliedAt > 0 ? <RelativeTime date={new Date(sub.lastAppliedAt)} /> : "never"}
      </Text>
      <Text variant="caption" tone="muted" className="w-14 text-right tabular-nums">
        {sub.refcount}
      </Text>
      <Text variant="caption" tone="muted" className="w-20">{sub.socket}</Text>
    </div>
  );
}
