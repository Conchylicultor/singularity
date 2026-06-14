import { useState } from "react";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
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
  width?: string;
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
  width = "w-[420px]",
  disabled,
  onLaunched,
  showPreprompt = true,
}: LaunchAgentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [prepromptId, setPrepromptId] = useState<string | null>(null);

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      align={align}
      // eslint-disable-next-line spacing/no-adhoc-spacing -- space-y between popover sections passed as a className string to InlinePopover (no flex container to host a Stack)
      contentClassName={`${width} max-w-[90vw] space-y-3 p-md`}
    >
      <Stack gap="xs">
        <Text as="div" variant="label">
          {title}
        </Text>
        <Text as="div" variant="caption" tone="muted">
          {description}
        </Text>
      </Stack>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="focus-ring border-input placeholder:text-muted-foreground min-h-[80px] w-full resize-y rounded-md border bg-transparent px-sm py-xs text-body"
        rows={3}
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
        size="sm"
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
