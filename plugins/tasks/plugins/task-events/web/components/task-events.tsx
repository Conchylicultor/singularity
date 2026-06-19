import { MdOpenInNew } from "react-icons/md";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  attemptsResource,
  pushesResource,
  getRepoInfo,
} from "@plugins/tasks/core";
import { AttemptStatusBadge } from "@plugins/tasks/plugins/attempt-status/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";

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

  // Gate both resources together so the lists never paint from a half-loaded
  // snapshot (e.g. a confident "No pushes yet." while pushes are in-flight).
  const all = useCombinedResources({ attempts: attemptsQ, pushes: pushesQ });
  if (all.pending) return <Loading variant="rows" />;

  const attempts = all.data.attempts
    .filter((a) => a.taskId === taskId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const attemptIds = new Set(attempts.map((a) => a.id));
  const pushes = all.data.pushes
    .filter((p) => attemptIds.has(p.attemptId))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <Stack gap="xl">
      <Collapsible defaultOpen>
        <Stack gap="sm">
        <SectionHeaderRow variant="eyebrow">Pushes</SectionHeaderRow>
        <CollapsibleContent>
        <Stack gap="sm">
        {pushes.length === 0 ? (
          <Text as="p" variant="body" tone="muted">No pushes yet.</Text>
        ) : (
          <Stack as="ul" gap="xs">
            {pushes.map((push) => {
              const short = push.sha.slice(0, 7);
              const url = githubBase
                ? `${githubBase}/commit/${push.sha}`
                : null;
              return (
                <li key={push.id}>
                  <Row
                    as={url ? "a" : "div"}
                    href={url ?? undefined}
                    target={url ? "_blank" : undefined}
                    rel={url ? "noreferrer" : undefined}
                    bordered
                  >
                    <Frame
                      className="w-full"
                      gap="md"
                      leading={
                        <Text as="code" variant="caption" tone="muted" className="font-mono">
                          {short}
                        </Text>
                      }
                      content={push.message}
                      trailing={
                        <>
                          <Text as="span" variant="caption" tone="muted" className="tabular-nums">
                            {formatDate(push.createdAt)}
                          </Text>
                          {url ? (
                            <MdOpenInNew className="text-muted-foreground size-4" />
                          ) : null}
                        </>
                      }
                    />
                  </Row>
                </li>
              );
            })}
          </Stack>
        )}
        </Stack>
        </CollapsibleContent>
        </Stack>
      </Collapsible>

      <Collapsible defaultOpen>
        <Stack gap="sm">
        <SectionHeaderRow variant="eyebrow">Attempts</SectionHeaderRow>
        <CollapsibleContent>
        <Stack gap="sm">
        {attempts.length === 0 ? (
          <Text as="p" variant="body" tone="muted">No attempts yet.</Text>
        ) : (
          <Stack as="ul" gap="sm">
            {attempts.map((attempt) => {
              const convs = attempt.conversations;
              return (
                <Stack
                  as="li"
                  key={attempt.id}
                  gap="sm"
                  className="rounded-md border px-md py-sm"
                >
                  <Frame
                    gap="md"
                    leading={<AttemptStatusBadge status={attempt.status} />}
                    content={
                      <TruncatingText className="text-caption font-mono text-muted-foreground">
                        {attempt.worktreePath.split("/").pop()}
                      </TruncatingText>
                    }
                    trailing={
                      <Text as="span" variant="caption" tone="muted" className="tabular-nums">
                        {formatDate(attempt.createdAt)}
                      </Text>
                    }
                  />
                  {convs.length === 0 ? (
                    <Text as="p" variant="caption" tone="muted" className="pl-xs">
                      No conversations.
                    </Text>
                  ) : (
                    <Stack as="ul" gap="xs">
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
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        )}
        </Stack>
        </CollapsibleContent>
        </Stack>
      </Collapsible>
    </Stack>
  );
}
