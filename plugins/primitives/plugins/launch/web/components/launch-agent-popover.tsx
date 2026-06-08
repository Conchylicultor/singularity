import { useState } from "react";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
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
}: LaunchAgentPopoverProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      align={align}
      contentClassName={`${width} max-w-[90vw] space-y-3 p-3`}
    >
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="focus-ring border-input placeholder:text-muted-foreground min-h-[80px] w-full resize-y rounded-md border bg-transparent px-2.5 py-1.5 text-sm"
        rows={3}
      />
      <LaunchControl
        size="sm"
        disabled={disabled}
        openAfterLaunch={openAfterLaunch}
        getRequest={() => getRequest(text)}
        onLaunched={(conv) => {
          setOpen(false);
          onLaunched?.(conv);
        }}
      />
    </InlinePopover>
  );
}
