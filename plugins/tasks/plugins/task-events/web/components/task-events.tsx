import { useEffect, useMemo, useState } from "react";
import { MdOpenInNew } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/row/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  attemptsResource,
  pushesResource,
} from "@plugins/tasks/core";
import { AttemptStatusBadge } from "@plugins/tasks/plugins/attempt-status/web";
import { Row } from "@plugins/primitives/plugins/row/web";

type RepoInfo = { githubBase: string | null };

function useGithubBase(): string | null {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/repo-info");
        if (!res.ok) return;
        const info = (await res.json()) as RepoInfo;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!cancelled) setBase(info.githubBase);
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {
        // leave base null — row still renders without a link
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return base;
}

function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskEvents({ taskId }: { taskId: string }) {
  const attemptsQ = useResource(attemptsResource);
  const pushesQ = useResource(pushesResource);
  const githubBase = useGithubBase();
  const openPane = useOpenPane();
  // Find the last conversationPane in the chain — if there are multiple
  // (host + nested), the last one is the one the user opened from here.
  const convEntries = conversationPane.useRouteEntries();
  const activeConvEntry = convEntries.length > 1
    ? convEntries[convEntries.length - 1]!
    : null;
  const activeConvId = activeConvEntry?.params.convId;

  const attempts = useMemo(() => {
    if (attemptsQ.pending) return [];
    return attemptsQ.data
      .filter((a) => a.taskId === taskId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [attemptsQ, taskId]);

  const attemptIds = useMemo(() => new Set(attempts.map((a) => a.id)), [attempts]);

  const pushes = useMemo(() => {
    if (pushesQ.pending) return [];
    return pushesQ.data
      .filter((p) => attemptIds.has(p.attemptId))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [pushesQ, attemptIds]);

  return (
    <div className="flex flex-col gap-6">
      <Collapsible defaultOpen className="flex flex-col gap-2">
        <SectionHeaderRow variant="eyebrow">Pushes</SectionHeaderRow>
        <CollapsibleContent className="flex flex-col gap-2">
        {pushes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pushes yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {pushes.map((push) => {
              const short = push.sha.slice(0, 7);
              const url = githubBase
                ? `${githubBase}/commit/${push.sha}`
                : null;
              const content = (
                <>
                  <code className="text-muted-foreground shrink-0 font-mono text-xs">
                    {short}
                  </code>
                  <span className="flex-1 truncate text-sm">{push.message}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatDate(push.createdAt)}
                  </span>
                  {url ? (
                    <MdOpenInNew className="text-muted-foreground size-4 shrink-0" />
                  ) : null}
                </>
              );
              return (
                <li key={push.id}>
                  <Row
                    as={url ? "a" : "div"}
                    href={url ?? undefined}
                    target={url ? "_blank" : undefined}
                    rel={url ? "noreferrer" : undefined}
                    bordered
                    className="gap-3"
                  >
                    {content}
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen className="flex flex-col gap-2">
        <SectionHeaderRow variant="eyebrow">Attempts</SectionHeaderRow>
        <CollapsibleContent className="flex flex-col gap-2">
        {attempts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No attempts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map((attempt) => {
              const convs = attempt.conversations;
              return (
                <li
                  key={attempt.id}
                  className="flex flex-col gap-2 rounded border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <AttemptStatusBadge status={attempt.status} />
                    <span className="text-muted-foreground flex-1 truncate font-mono text-xs">
                      {attempt.worktreePath.split("/").pop()}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatDate(attempt.createdAt)}
                    </span>
                  </div>
                  {convs.length === 0 ? (
                    <p className="text-muted-foreground pl-1 text-xs">
                      No conversations.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {convs.map((c) => {
                        const isActive = activeConvId === c.id;
                        return (
                          <li key={c.id}>
                            <Row
                              selected={isActive}
                              onClick={() => {
                                if (activeConvId === c.id && activeConvEntry) {
                                  conversationPane.close(activeConvEntry.instanceId);
                                } else {
                                  openPane(conversationPane, {
                                    convId: c.id,
                                  }, { mode: "push" });
                                }
                              }}
                            >
                              <ConversationItem conv={c} />
                            </Row>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
