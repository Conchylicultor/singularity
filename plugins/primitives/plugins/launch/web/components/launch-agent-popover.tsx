import { useId, useState } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { PopoverWidth } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { PaneOpenMode } from "@plugins/primitives/plugins/pane/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import { LaunchControl } from "./launch-control";
import type { LaunchRequest } from "./launch-control";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";

export type LaunchAgentFormProps = {
  title: string;
  description: React.ReactNode;
  placeholder?: string;
  getRequest: (userText: string) => LaunchRequest | Promise<LaunchRequest>;
  disabled?: boolean;
  onLaunched?: (conversation: Conversation) => void;
  /** Whether to show the preprompt picker. Defaults to `true`. */
  showPreprompt?: boolean;
  /**
   * Whether launching also OPENS the conversation it created. Defaults to
   * `false` — the fire-and-forget background launch every caller of
   * `LaunchAgentPopover` has always got, so hosting the form somewhere else is
   * what opts into the pane, never the other way round.
   */
  openAfterLaunch?: boolean;
  /** Where that conversation opens, when it does. Forwarded to `LaunchControl`. */
  openMode?: PaneOpenMode;
};

/**
 * The launch FORM: what the user reads (title + description), the free-form
 * extra context they type, the preprompt they pick, and the launch control
 * itself. It owns the context text and the preprompt selection; the host owns
 * where the form sits and what happens after a launch.
 *
 * It is a form and not a popover because a second host needs exactly this body
 * inside a popover it already owns (a container card's glyph panel), and an
 * `InlinePopover` nested in another popover is not an option.
 */
export function LaunchAgentForm({
  title,
  description,
  placeholder = "Extra context (optional)…",
  getRequest,
  disabled,
  onLaunched,
  showPreprompt = true,
  openAfterLaunch = false,
  openMode,
}: LaunchAgentFormProps) {
  const [text, setText] = useState("");
  const [prepromptId, setPrepromptId] = useState<string | null>(null);
  // Stable per-instance Lexical namespace so multiple forms don't collide.
  const editorId = useId();

  return (
    <Stack gap="md">
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
        namespace={`launch-agent-form-${editorId}`}
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
        openAfterLaunch={openAfterLaunch}
        openMode={openMode}
        getRequest={async () => {
          const req = await getRequest(text);
          return prepromptId ? { ...req, prepromptId } : req;
        }}
        onLaunched={onLaunched}
      />
    </Stack>
  );
}

/**
 * The popover's props are the form's, MINUS the two knobs about opening the
 * launched conversation: this surface is always a fire-and-forget background
 * launch (callers surface a confirmation toast via `onLaunched`), so neither is
 * a caller's to set.
 */
export type LaunchAgentPopoverProps = Omit<
  LaunchAgentFormProps,
  "openAfterLaunch" | "openMode"
> & {
  trigger: React.ReactElement;
  align?: "start" | "end";
  width?: PopoverWidth;
};

export function LaunchAgentPopover({
  trigger,
  align = "start",
  width = "3xl",
  onLaunched,
  ...form
}: LaunchAgentPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      align={align}
      width={width}
    >
      <LaunchAgentForm
        {...form}
        onLaunched={(conv) => {
          setOpen(false);
          onLaunched?.(conv);
        }}
      />
    </InlinePopover>
  );
}
