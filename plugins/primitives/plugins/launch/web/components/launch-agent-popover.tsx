import { useId, useState } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { PopoverWidth } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import { LaunchControl } from "./launch-control";
import type { LaunchRequest } from "./launch-control";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";

export type LaunchAgentPopoverProps = {
  trigger: React.ReactElement;
  title: string;
  description: React.ReactNode;
  placeholder?: string;
  getRequest: (userText: string) => LaunchRequest | Promise<LaunchRequest>;
  align?: "start" | "end";
  width?: PopoverWidth;
  disabled?: boolean;
  onLaunched?: (conversation: Conversation) => void;
  /** Whether to show the preprompt picker. Defaults to `true`. */
  showPreprompt?: boolean;
};

export function LaunchAgentPopover({
  trigger,
  title,
  description,
  placeholder = "Extra context (optional)…",
  getRequest,
  align = "start",
  width = "3xl",
  disabled,
  onLaunched,
  showPreprompt = true,
}: LaunchAgentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [prepromptId, setPrepromptId] = useState<string | null>(null);
  // Stable per-instance Lexical namespace so multiple popovers don't collide.
  const editorId = useId();

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      align={align}
      width={width}
      // eslint-disable-next-line spacing/no-adhoc-spacing -- space-y between popover sections passed as a className string to InlinePopover (no flex container to host a Stack)
      contentClassName="space-y-3"
    >
      <Stack gap="xs">
        <Text as="div" variant="label">
          {title}
        </Text>
        <Text as="div" variant="caption" tone="muted">
          {description}
        </Text>
      </Stack>
      <TextEditor
        value={text}
        onChange={setText}
        placeholder={placeholder}
        submitMode="none"
        minRows={3}
        maxHeight="16rem"
        namespace={`launch-agent-popover-${editorId}`}
      />
      {showPreprompt && (
        <PrepromptSelect
          value={prepromptId}
          onChange={setPrepromptId}
          ariaLabel="Preprompt"
          className="w-full"
        />
      )}
      <LaunchControl
        disabled={disabled}
        // The popover is always a fire-and-forget background launch; callers
        // surface a confirmation toast via onLaunched.
        openAfterLaunch={false}
        getRequest={async () => {
          const req = await getRequest(text);
          return prepromptId ? { ...req, prepromptId } : req;
        }}
        onLaunched={(conv) => {
          setOpen(false);
          onLaunched?.(conv);
        }}
      />
    </InlinePopover>
  );
}
