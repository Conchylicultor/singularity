import { useEffect, useMemo, useState } from "react";
import { MdOpenInNew } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  attemptsResource,
  pushesResource,
  type Attempt,
} from "@plugins/tasks/core";
import { cn } from "@/lib/utils";

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

const ATTEMPT_STATUS_CLASSES: Record<Attempt["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  pushed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  abandoned: "bg-muted text-muted-foreground italic",
};

const ATTEMPT_STATUS_LABELS: Record<Attempt["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  pushed: "Pushed",
  completed: "Completed",
  abandoned: "Abandoned",
};

export function TaskEvents({ taskId }: { taskId: string }) {
  const attemptsQ = useResource(attemptsResource);
  const pushesQ = useResource(pushesResource);
  const githubBase = useGithubBase();
  const match = usePaneMatch();
  const openPane = useOpenPane();
  // Find the last conversationPane in the chain — if there are multiple
  // (host + nested), the last one is the one the user opened from here.
  const convEntries = match?.chain.filter(
    (e) => e.pane === conversationPane._internal,
  ) ?? [];
  const activeConvId = convEntries.length > 1
    ? convEntries[convEntries.length - 1]!.params.convId
    : undefined;

  const attempts = useMemo(() => {
    return attemptsQ.data
      .filter((a) => a.taskId === taskId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [attemptsQ.data, taskId]);

  const attemptIds = useMemo(() => new Set(attempts.map((a) => a.id)), [attempts]);

  const pushes = useMemo(() => {
    return pushesQ.data
      .filter((p) => attemptIds.has(p.attemptId))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [pushesQ.data, attemptIds]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionLabel as="h3" className="font-medium">
          Pushes
        </SectionLabel>
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
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:bg-accent flex items-center gap-3 rounded border px-3 py-2"
                    >
                      {content}
                    </a>
                  ) : (
                    <div className="flex items-center gap-3 rounded border px-3 py-2">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel as="h3" className="font-medium">
          Attempts
        </SectionLabel>
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
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-medium",
                        ATTEMPT_STATUS_CLASSES[attempt.status],
                      )}
                    >
                      {ATTEMPT_STATUS_LABELS[attempt.status]}
                    </span>
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
                            <button
                              type="button"
                              onClick={() => {
                                if (activeConvId === c.id) {
                                  conversationPane.close();
                                } else {
                                  openPane(conversationPane, {
                                    convId: c.id,
                                  }, { mode: "push" });
                                }
                              }}
                              className={cn(
                                "hover:bg-accent flex w-full items-start rounded px-2 py-1 text-left",
                                isActive && "bg-accent",
                              )}
                            >
                              <ConversationItem conv={c} />
                            </button>
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
      </section>
    </div>
  );
}
