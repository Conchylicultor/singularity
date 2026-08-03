import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { patchTask, useTask } from "@plugins/tasks/web";
import { useRegisterFlush } from "@plugins/tasks/plugins/task-detail/web";
import { StatusSignal } from "@plugins/tasks/plugins/task-status/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { AuthorDisplay } from "./author-display";

export function TaskHeader({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const titleField = useEditableField({
    value: task?.title ?? "",
    onSave: (v) => patchTask(taskId, { title: v.trim() || "Untitled" }),
    label: "Task title",
  });
  useRegisterFlush(titleField.flush);

  const toggleDrop = () => {
    if (!task) return;
    void patchTask(taskId, { drop: task.status !== "dropped" });
  };

  const toggleHold = () => {
    if (!task) return;
    void patchTask(taskId, { hold: task.status !== "held" });
  };

  if (!task) return null;

  return (
    <Stack gap="lg">
      <input
        value={titleField.value}
        onChange={(e) => titleField.onChange(e.target.value)}
        onFocus={titleField.onFocus}
        onBlur={titleField.onBlur}
        placeholder="Untitled"
        className="text-title w-full bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
      />
      <div className="flex items-center gap-md">
        <SectionLabel as="span">Status</SectionLabel>
        <StatusSignal status={task.status} />
        <div className="ml-auto flex items-center gap-xs">
          <Button variant="ghost" onClick={toggleHold}>
            {task.status === "held" ? "Resume" : "Hold"}
          </Button>
          <Button variant="ghost" onClick={toggleDrop}>
            {task.status === "dropped" ? "Undrop" : "Drop task"}
          </Button>
        </div>
      </div>
      <Stack direction="row" align="center" gap="md">
        <SectionLabel as="span">
          Author
        </SectionLabel>
        <AuthorDisplay author={task.author ?? "user"} />
      </Stack>
      <Stack direction="row" align="center" gap="md">
        <SectionLabel as="span">
          Created
        </SectionLabel>
        <Text as="span" variant="caption">
          <RelativeTime date={new Date(task.createdAt)} />
        </Text>
      </Stack>
      {task.finishedAt != null && (
        <Stack direction="row" align="center" gap="md">
          <SectionLabel as="span">
            Closed
          </SectionLabel>
          <Text as="span" variant="caption">
            <RelativeTime date={new Date(task.finishedAt)} />
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
