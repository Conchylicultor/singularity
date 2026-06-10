import { useState } from "react";
import { Text } from "@plugins/primitives/plugins/text/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import { LaunchControl } from "./launch-control";
import type { LaunchRequest } from "./launch-control";
import type { Conversation } from "@plugins/tasks-core/core";

export type LaunchAgentPopoverProps = {
  trigger: React.ReactElement;
  title: string;
  description: React.ReactNode;
  placeholder?: string;
  getRequest: (userText: string) => LaunchRequest | Promise<LaunchRequest>;
  align?: "start" | "end";
  width?: string;
  disabled?: boolean;
  /**
   * Whether to open the freshly created conversation in a pane. Defaults to
   * `true`. Pass `false` to launch in the background — the caller typically
   * surfaces a confirmation toast via `onLaunched` instead.
   */
  openAfterLaunch?: boolean;
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
  openAfterLaunch = true,
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
      contentClassName={`${width} max-w-[90vw] space-y-3 p-3`}
    >
      <div className="space-y-1">
        <Text as="div" variant="label">
          {title}
        </Text>
        <Text as="div" variant="caption" tone="muted">
          {description}
        </Text>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="focus-ring border-input placeholder:text-muted-foreground min-h-[80px] w-full resize-y rounded-md border bg-transparent px-2.5 py-1.5 text-body"
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
        openAfterLaunch={openAfterLaunch}
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
