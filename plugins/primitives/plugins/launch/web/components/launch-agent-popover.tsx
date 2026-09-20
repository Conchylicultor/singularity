import { useId, useState } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Button,
  type PopoverWidth,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import type { PaneOpenMode } from "@plugins/primitives/plugins/pane/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { ComposerField } from "@plugins/primitives/plugins/text-editor/plugins/composer/web";
import { Switch } from "@plugins/primitives/plugins/css/plugins/switch/web";
import {
  useDefaultModel,
  useSetDefaultModel,
} from "@plugins/conversations/plugins/model-provider/web";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import { PrepromptPill } from "./preprompt-pill";
import { RunPill } from "./run-pill";
import { useLaunchConversation } from "./launch-control";
import type { LaunchRequest } from "./launch-control";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";

/**
 * An on/off choice the caller adds to the form. The form draws it and hands
 * its current value to `getRequest`; what it means (usually a paragraph added
 * to the prompt) is the caller's.
 */
export type LaunchToggle = {
  /** Key of this toggle's value in `getRequest`'s `toggles` argument. */
  id: string;
  label: string;
  /** Muted second line under the label. */
  description?: string;
  /** Starting value. Defaults to `false`. */
  defaultValue?: boolean;
};

export type LaunchAgentFormProps = {
  title: string;
  description: React.ReactNode;
  placeholder?: string;
  /** Receives the typed text and every toggle's value, keyed by its `id`. */
  getRequest: (
    userText: string,
    toggles: Readonly<Record<string, boolean>>,
  ) => LaunchRequest | Promise<LaunchRequest>;
  toggles?: readonly LaunchToggle[];
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
  /** Where that conversation opens, when it does. */
  openMode?: PaneOpenMode;
};

/**
 * The launch FORM: what the user reads (title + description), one composer
 * field holding the free-form extra context and — on its own bar, inside the
 * same box — the preprompt and the model + thinking mode the launch will use,
 * then the caller's toggles, then the Launch button.
 *
 * It owns the context text and every one of those choices; the host owns where
 * the form sits and what happens after a launch.
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
  toggles = [],
  disabled,
  onLaunched,
  showPreprompt = true,
  openAfterLaunch = false,
  openMode,
}: LaunchAgentFormProps) {
  const [text, setText] = useState("");
  const [prepromptId, setPrepromptId] = useState<string | null>(null);
  const [effort, setEffort] = useState<EffortLevel | null>(null);
  const [toggleValues, setToggleValues] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(toggles.map((t) => [t.id, t.defaultValue ?? false])),
  );
  // Stable per-instance Lexical namespace so multiple forms don't collide.
  const editorId = useId();

  // The model the pill shows IS the persisted default, and picking one writes
  // it — the behaviour the split button had, with no second copy of the value
  // that could drift from it while the form is open.
  const model = useDefaultModel();
  const setDefaultModel = useSetDefaultModel();

  const { launch } = useLaunchConversation({
    openAfterLaunch,
    openMode,
    onLaunched,
    getRequest: async () => {
      const req = await getRequest(text, toggleValues);
      return {
        ...req,
        ...(prepromptId ? { prepromptId } : {}),
        ...(effort ? { effort } : {}),
      };
    },
  });

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
      <ComposerField
        value={text}
        onChange={setText}
        placeholder={placeholder}
        submitMode="none"
        minRows={3}
        maxHeight="16rem"
        namespace={`launch-agent-form-${editorId}`}
        barStart={
          showPreprompt ? (
            <PrepromptPill
              value={prepromptId}
              onChange={setPrepromptId}
              disabled={disabled}
            />
          ) : undefined
        }
        barEnd={
          <RunPill
            model={model}
            onModelChange={setDefaultModel}
            effort={effort}
            onEffortChange={setEffort}
            disabled={disabled}
          />
        }
      />
      {toggles.map((t) => (
        <LaunchToggleRow
          key={t.id}
          toggle={t}
          checked={toggleValues[t.id] ?? false}
          onCheckedChange={(checked) =>
            setToggleValues((prev) => ({ ...prev, [t.id]: checked }))
          }
        />
      ))}
      <Line>
        {/* The empty flexible cell: the button sits flush right in its own
            track rather than floating over the toggles above it. */}
        <Fill />
        {/* `launch` returns a promise, so the button pends and locks itself for
            the whole round trip with no wiring of our own. */}
        <Button disabled={disabled} onClick={() => launch(model)}>
          Launch
        </Button>
      </Line>
    </Stack>
  );
}

function LaunchToggleRow({
  toggle,
  checked,
  onCheckedChange,
}: {
  toggle: LaunchToggle;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const switchId = useId();
  return (
    <Stack direction="row" gap="sm" align="start">
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      {/* A `<label for>` names the switch with both lines, and clicking either
          line flips it. */}
      <label htmlFor={switchId} className="cursor-pointer select-none">
        <Stack as="span" gap="none">
          <Text variant="label">{toggle.label}</Text>
          {toggle.description ? (
            <Text variant="caption" tone="muted">
              {toggle.description}
            </Text>
          ) : null}
        </Stack>
      </label>
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
