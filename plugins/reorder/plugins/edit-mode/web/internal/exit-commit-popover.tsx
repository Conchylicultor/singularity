import { type ReactNode } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
} from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import {
  useApplyAllReorderDefaults,
  useDiscardAllStagedDefaults,
} from "@plugins/reorder/plugins/staging/web";
import { useExitPromptOpen, setExitPromptOpen } from "./exit-prompt-store";

/**
 * Hosts the pen button together with the exit Cancel / Commit popover. The
 * popover anchors to a dedicated invisible anchor sitting at the pen's corner —
 * NOT to the pen itself — so clicking the pen only toggles edit mode and never
 * (de)triggers the popover (base-ui's Popover has no standalone Anchor part; its
 * Trigger is the anchor, so a separate zero-size trigger is the clean decoupling).
 *
 * Open/close is driven by the module-level `exit-prompt-store` flag (set by the
 * stable `ExitPromptObserver` on the edit-mode `true → false` transition). The
 * flag lives outside this component because the pen button remounts when edit
 * mode toggles (the action-bar slot re-renders through the reorder middleware),
 * which would reset any component-local transition tracker. Dismissing the
 * popover (outside-press / Esc) clears the flag but leaves edits staged.
 */
export function ExitCommitPopover({ children }: { children: ReactNode }) {
  const open = useExitPromptOpen();
  const applyAll = useApplyAllReorderDefaults();
  const discardAll = useDiscardAllStagedDefaults();

  const commit = () => {
    // `.mutate` returns void (no floating promise); the land job runs in the
    // background and clears the staged rows + notifies on completion.
    applyAll.mutate({});
    setExitPromptOpen(false);
  };
  const cancel = () => {
    discardAll.mutate({});
    setExitPromptOpen(false);
  };

  return (
    <span className="relative inline-flex">
      {children}
      <Popover open={open} onOpenChange={(next) => setExitPromptOpen(next)}>
        {/* Invisible anchor at the pen's corner; never receives the pen click. */}
        <PopoverTrigger
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute bottom-0 right-0 size-0"
        />
        <PopoverContent align="end" className="w-64">
          <Stack gap="sm">
            <Text variant="label">Apply layout for everyone?</Text>
            <Text variant="caption" tone="muted">
              Commit stages these defaults for review and lands them for
              everyone. Cancel discards them. Closing keeps them staged.
            </Text>
            <Stack direction="row" gap="sm" justify="end">
              <Button variant="ghost" size="sm" onClick={cancel}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={commit}>
                Commit
              </Button>
            </Stack>
          </Stack>
        </PopoverContent>
      </Popover>
    </span>
  );
}
