import { useCallback, useEffect, useMemo, useState } from "react";
import { MdRestore } from "react-icons/md";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Button } from "@/components/ui/button";
import { conversationsResource, listGoneConversations } from "@plugins/conversations/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { restoreBatch } from "../../shared/endpoints";
import type { Conversation } from "@plugins/tasks-core/core";

const GONE_PAGE_SIZE = 50;
const QUERY_KEY = ["conversations-recover", "recent-closed"];

const CLUSTER_WINDOW_MS = 1000;

function groupByEndedAt(items: Conversation[]): Conversation[][] {
  const groups: Conversation[][] = [];
  for (const item of items) {
    const head = groups[groups.length - 1];
    const prev = head?.[head.length - 1];
    if (
      head &&
      prev?.endedAt &&
      item.endedAt &&
      prev.endedAt.getTime() - item.endedAt.getTime() <= CLUSTER_WINDOW_MS
    ) {
      head.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RecoveryView() {
  const resource = useResource(conversationsResource);
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Conversation[]> => {
      const before = new Date().toISOString();
      const data = await fetchEndpoint(listGoneConversations, {}, { query: { before, limit: String(GONE_PAGE_SIZE) } });
      return data.items;
    },
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!resource.pending) {
      // eslint-disable-next-line reactive-server-io/no-reactive-server-io -- read-only per-tab view refresh on live-state change; each tab maintains its own query cache, no cross-tab write to deduplicate
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  }, [resource.pending, queryClient]);

  const items = useMemo(() => q.data ?? [], [q.data]);
  const isLoading = q.isLoading;

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());

  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const aMs = a.endedAt?.getTime() ?? 0;
      const bMs = b.endedAt?.getTime() ?? 0;
      return bMs - aMs;
    });
    return groupByEndedAt(sorted);
  }, [items]);

  const setPendingFor = useCallback((ids: string[], value: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const restore = useCallback(
    async (ids: string[]) => {
      setPendingFor(ids, true);
      setRowErrors((prev) => {
        const next = new Map(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      try {
        const data = await fetchEndpoint(restoreBatch, {}, { body: { ids } });
        setRowErrors((prev) => {
          const next = new Map(prev);
          for (const r of data.results) {
            if (!r.ok) next.set(r.id, r.error);
          }
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setRowErrors((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.set(id, msg);
          return next;
        });
      } finally {
        setPendingFor(ids, false);
      }
    },
    [setPendingFor],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Text as="h2" variant="label" className="font-semibold shrink-0">Recovery</Text>
          {items.length > 0 && (
            <Text as="span" variant="caption" tone="muted" className="truncate">
              {items.length} recently closed
            </Text>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && items.length === 0 ? (
          <Placeholder>Loading…</Placeholder>
        ) : items.length === 0 ? (
          <Placeholder>No recently closed conversations.</Placeholder>
        ) : (
          <div className="flex flex-col">
            {groups.map((group) => {
              const first = group[0];
              if (!first) return null;
              return (
                <ClusterGroup
                  key={first.id}
                  group={group}
                  pending={pending}
                  rowErrors={rowErrors}
                  onRestore={restore}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ClusterGroup({
  group,
  pending,
  rowErrors,
  onRestore,
}: {
  group: Conversation[];
  pending: Set<string>;
  rowErrors: Map<string, string>;
  onRestore: (ids: string[]) => Promise<void>;
}) {
  const first = group[0];
  const isCluster = group.length > 1;
  const endedAt = first?.endedAt ?? null;
  const groupIds = useMemo(() => group.map((c) => c.id), [group]);
  const anyPending = groupIds.some((id) => pending.has(id));
  if (!first) return null;

  return (
    <div className="border-b">
      {isCluster && endedAt && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
          <Text as="span" variant="caption" className="font-medium">
            {formatTime(endedAt)} — {group.length} conversations closed
          </Text>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRestore(groupIds)}
            disabled={anyPending}
            className="h-7 text-caption"
          >
            {anyPending ? (
              <>
                <Spinner className="size-3.5 mr-1" />
                Restoring…
              </>
            ) : (
              <>
                <MdRestore className="size-3.5 mr-1" />
                Restore all ({group.length})
              </>
            )}
          </Button>
        </div>
      )}
      {group.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          pending={pending.has(conversation.id)}
          error={rowErrors.get(conversation.id) ?? null}
          onRestore={() => onRestore([conversation.id])}
        />
      ))}
    </div>
  );
}

function ConversationRow({
  conversation,
  pending,
  error,
  onRestore,
}: {
  conversation: Conversation;
  pending: boolean;
  error: string | null;
  onRestore: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <Text as="span" variant="caption" className="truncate font-medium">
            {conversation.title ?? conversation.id}
          </Text>
          <div className="flex items-center gap-2 text-3xs text-muted-foreground">
            <span>{conversation.model}</span>
            {conversation.endedAt && <span>{formatTime(conversation.endedAt)}</span>}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRestore}
          disabled={pending}
          className="h-7 text-caption"
        >
          {pending ? (
            <>
              <Spinner className="size-3.5 mr-1" />
              Restoring…
            </>
          ) : (
            <>
              <MdRestore className="size-3.5 mr-1" />
              Restore
            </>
          )}
        </Button>
      </div>
      {error && (
        <div className="px-4 py-1.5 bg-muted/10">
          <Text as="span" variant="caption" tone="destructive">{error}</Text>
        </div>
      )}
    </>
  );
}
