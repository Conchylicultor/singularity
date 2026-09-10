import { MdOpenInNew } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { ConversationRow } from "@plugins/conversations/plugins/conversation-ui/plugins/row/web";
import { useConversationOpener } from "@plugins/conversations/plugins/conversation-view/web";
import { getRepoInfo } from "@plugins/tasks/core";
import { pushesByAttemptResource } from "@plugins/tasks/plugins/tasks-core/core";
import type { Push } from "@plugins/tasks/plugins/tasks-core/core";
import { useTaskAttempts } from "@plugins/tasks/plugins/tasks-core/web";
import { AttemptStatusBadge } from "@plugins/tasks/plugins/attempt-status/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

function useGithubBase(): string | null {
  const { data } = useEndpoint(getRepoInfo, {});
  return data?.githubBase ?? null;
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

function PushRow({
  push,
  githubBase,
}: {
  push: Push;
  githubBase: string | null;
}) {
  const short = push.sha.slice(0, 7);
  const url = githubBase ? `${githubBase}/commit/${push.sha}` : null;
  return (
    <li>
      <Row
        href={url ?? undefined}
        target={url ? "_blank" : undefined}
        rel={url ? "noreferrer" : undefined}
        bordered
        className="gap-md"
      >
        <Text
          as="code"
          variant="caption"
          tone="muted"
          className={cn(rigidClass(), "font-mono")}
        >
          {short}
        </Text>
        <Fill as="span">
          <Text as="span" variant="body">
            {push.message}
          </Text>
        </Fill>
        <Text
          as="span"
          variant="caption"
          tone="muted"
          className={cn(rigidClass(), "tabular-nums")}
        >
          {formatDate(push.createdAt)}
        </Text>
        {url ? (
          <MdOpenInNew
            className={cn("text-muted-foreground size-4", rigidClass())}
          />
        ) : null}
      </Row>
    </li>
  );
}

// One attempt's pushes, subscribed per-attempt (bounded, correct for arbitrarily
// old attempts). Rendered once per attempt so a task's push history is grouped by
// attempt (attempts already sorted newest-first; pushes within an attempt too).
function AttemptPushList({
  attemptId,
  githubBase,
}: {
  attemptId: string;
  githubBase: string | null;
}) {
  const pushesQ = useResource(pushesByAttemptResource, { attemptId });
  if (pushesQ.pending) return null;
  const pushes = [...pushesQ.data].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  return (
    <>
      {pushes.map((push) => (
        <PushRow key={push.id} push={push} githubBase={githubBase} />
      ))}
    </>
  );
}

/**
 * A task with no attempts has neither pushes nor attempts to list. Declared as
 * both contributions' `useAvailable` rather than an empty-state placeholder in
 * the body: the host paints the card before it reaches the body, so "No pushes
 * yet." is a titled bar the user opens onto nothing.
 */
export function useHasTaskAttempts({ taskId }: { taskId: string }): boolean {
  const attempts = useTaskAttempts(taskId);
  return !attempts.pending && attempts.data.length > 0;
}

export function TaskPushes({ taskId }: { taskId: string }) {
  const attempts = useTaskAttempts(taskId);
  const githubBase = useGithubBase();

  if (attempts.pending) return <Loading variant="rows" />;
  if (attempts.data.length === 0) {
    return (
      <Text as="p" variant="body" tone="muted">
        No pushes yet.
      </Text>
    );
  }

  return (
    <Stack as="ul" gap="xs">
      {attempts.data.map((a) => (
        <AttemptPushList key={a.id} attemptId={a.id} githubBase={githubBase} />
      ))}
    </Stack>
  );
}

export function TaskAttempts({ taskId }: { taskId: string }) {
  const attempts = useTaskAttempts(taskId);
  const opener = useConversationOpener();

  if (attempts.pending) return <Loading variant="rows" />;
  if (attempts.data.length === 0) {
    return (
      <Text as="p" variant="body" tone="muted">
        No attempts yet.
      </Text>
    );
  }

  return (
    <Stack as="ul" gap="sm">
      {attempts.data.map((attempt) => {
        const convs = attempt.conversations;
        return (
          <Stack
            as="li"
            key={attempt.id}
            gap="sm"
            className="rounded-md border px-md py-sm"
          >
            <Line className="gap-md">
              <AttemptStatusBadge status={attempt.status} />
              <Fill as="span">
                <Text className="text-caption font-mono text-muted-foreground">
                  {attempt.worktreePath.split("/").pop()}
                </Text>
              </Fill>
              <Text
                as="span"
                variant="caption"
                tone="muted"
                className={cn(rigidClass(), "tabular-nums")}
              >
                {formatDate(attempt.createdAt)}
              </Text>
            </Line>
            {convs.length === 0 ? (
              <Text as="p" variant="caption" tone="muted" className="pl-xs">
                No conversations.
              </Text>
            ) : (
              <Stack as="ul" gap="xs">
                {convs.map((c) => (
                  <li key={c.id}>
                    <ConversationRow
                      conv={c}
                      actions={
                        <IconButton
                          icon={MdOpenInNew}
                          label="Open as page"
                          tooltip="Open in a new page"
                          onClick={() => opener.openAsPage(c.id)}
                        />
                      }
                    />
                  </li>
                ))}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
