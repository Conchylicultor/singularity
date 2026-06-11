import { useId, useRef, useState } from "react";
import { z } from "zod";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { useActiveDataBinding } from "@plugins/active-data/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import {
  attemptsResource,
  tasksResource,
  createTask as createTaskEndpoint,
} from "@plugins/tasks/core";
import { AttemptStatusBadge } from "@plugins/tasks/plugins/attempt-status/web";
import { Button } from "@/components/ui/button";
import { Row } from "@plugins/primitives/plugins/row/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/card/web";

const TaskBindingSchema = z.object({
  taskId: z.string(),
  launchedConvId: z.string().optional(),
});
type TaskBinding = z.infer<typeof TaskBindingSchema>;

export function TaskCard({
  content,
}: {
  attrs: Record<string, string>;
  content: string;
}) {
  const initial = content.trim();
  const editorNs = useId();
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const hostTaskId = conversation?.taskId ?? null;

  const binding = useActiveDataBinding<TaskBinding>(TaskBindingSchema);

  const [prompt, setPrompt] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Captured in a ref (not state) because onLaunched closes over the render
  // it was created in — a state setter from getRequest wouldn't be visible
  // to the in-flight callback. The ref always reads the latest value.
  const pendingTaskIdRef = useRef<string | null>(null);

  if (!initial) return null;

  // Wait for the binding to load before rendering anything destructive — the
  // editable card collapses to a chip once we know the persisted state, so
  // showing the card during load would briefly invite a duplicate Create.
  if (binding.enabled && binding.pending) return null;
  const value = binding.pending ? null : binding.value;

  if (value?.launchedConvId && value.taskId) {
    return (
      <div className="my-2 flex flex-col gap-1.5">
        <Text as="p" variant="body" tone="muted">{initial}</Text>
        <LaunchedAttempts taskId={value.taskId} />
      </div>
    );
  }

  if (value?.taskId) {
    return <TaskChip taskId={value.taskId} />;
  }

  const trimmed = prompt.trim();
  const disabled = creating || !trimmed;

  const createTask = async () => {
    return fetchEndpoint(createTaskEndpoint, {}, { body: { folderId: hostTaskId, description: trimmed } });
  };

  const onCreate = async () => {
    if (creating || !trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const task = await createTask();
      await binding.set({ taskId: task.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="bg-background my-2 flex flex-col gap-2 p-2">
      <TextEditor
        value={prompt}
        onChange={setPrompt}
        placeholder="What should be done?"
        disabled={creating}
        minRows={3}
        maxHeight="20rem"
        namespace={`active-data-task-${editorNs}`}
      />
      <div className="flex items-center justify-end gap-2">
        {error ? (
          <Text as="span" variant="caption" tone="destructive" className="mr-auto truncate" title={error}>
            {error}
          </Text>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreate}
          disabled={disabled}
          title="Create task"
        >
          {creating ? "Creating…" : "Create"}
        </Button>
        <LaunchControl
          size="icon"
          disabled={disabled}
          openAfterLaunch={false}
          getRequest={async () => {
            const task = await createTask();
            pendingTaskIdRef.current = task.id;
            await binding.set({ taskId: task.id });
            return { taskId: task.id, prompt: trimmed };
          }}
          onLaunched={async (conv) => {
            const taskId = pendingTaskIdRef.current;
            if (taskId) {
              await binding.set({ taskId, launchedConvId: conv.id });
            }
          }}
        />
      </div>
    </Card>
  );
}

function LaunchedAttempts({ taskId }: { taskId: string }) {
  const attemptsQ = useResource(attemptsResource);
  const openPane = useOpenPane();
  // Find the last conversationPane in the chain — if there are multiple
  // (host + nested), the last one is the one the user opened from here.
  const convEntries = conversationPane.useRouteEntries();
  const activeConvEntry = convEntries.length > 1
    ? convEntries[convEntries.length - 1]!
    : null;
  const activeConvId = activeConvEntry?.params.convId;

  if (attemptsQ.pending) return <Loading variant="text" />;

  const attempts = attemptsQ.data
    .filter((a) => a.taskId === taskId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  if (attempts.length === 0) {
    return (
      <Text as="span" variant="caption" tone="muted" className="block">
        Launching…
      </Text>
    );
  }

  return (
    <Card className="flex flex-col gap-2 px-3 py-2 bg-transparent">
      {attempts.map((attempt) => (
        <div key={attempt.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <AttemptStatusBadge status={attempt.status} />
            <Text as="span" variant="caption" tone="muted" className="truncate font-mono">
              {attempt.worktreePath.split("/").pop()}
            </Text>
          </div>
          {attempt.conversations.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {attempt.conversations.map((c) => {
                const isActive = activeConvId === c.id;
                return (
                  <li key={c.id}>
                    <Row
                      selected={isActive}
                      onClick={() => {
                        if (activeConvId === c.id && activeConvEntry) {
                          conversationPane.close(activeConvEntry.instanceId);
                        } else {
                          openPane(conversationPane, { convId: c.id }, { mode: "push" });
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
        </div>
      ))}
    </Card>
  );
}

function TaskChip({ taskId }: { taskId: string }) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const tasksResult = useResource(tasksResource);
  const openPane = useOpenPane();
  if (!conversation) return null;
  if (tasksResult.pending) return null;
  const task = tasksResult.data.find((t) => t.id === taskId);
  const title = task?.title.trim() || "Untitled task";
  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        openPane(taskSidePane, { taskId }, { mode: "push", input: { convId: conversation.id } });
      }}
      leading={<span className="text-muted-foreground">✓</span>}
      title={title}
    >
      {title}
    </LinkChip>
  );
}
