import { useCallback, useEffect, useRef, useState } from "react";
import { MdLink } from "react-icons/md";
import {
  $getSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  type BaseSelection,
} from "lexical";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import {
  useFormatToolbar,
  OPEN_LINK_POPOVER_COMMAND,
} from "@plugins/page/plugins/editor/web";
import { LinkForm, type LinkFormResult } from "./link-form";

/**
 * Inline-link toolbar control. A chain button, active when the selection sits
 * within a link, opening a popover holding the shared `LinkForm` (URL only).
 *
 * Selection survival: opening the popover moves focus into the input, which would
 * collapse the editor selection. We (1) pin the toolbar so the bar doesn't tear
 * down, and (2) snapshot the live `RangeSelection` on open and restore it inside
 * the `editor.update` before dispatching `TOGGLE_LINK_COMMAND`, so the link
 * applies to the originally-selected span. `LinkForm` normalizes the URL
 * (`https://` / `mailto:` defaulting, allowed-protocol gate) before Apply ever
 * reaches us; Remove passes `null`.
 */
export function LinkButton() {
  const toolbar = useFormatToolbar();
  const [open, setOpen] = useState(false);
  // The editor selection captured when the popover opened (restored on apply).
  const savedSelection = useRef<BaseSelection | null>(null);

  const editor = toolbar?.editor ?? null;
  const setPinned = toolbar?.setPinned;
  const activeLink = toolbar?.link ?? null;

  const openPopover = useCallback(() => {
    if (!editor) return;
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      savedSelection.current = sel ? sel.clone() : null;
    });
    setPinned?.(true);
    setOpen(true);
  }, [editor, setPinned]);

  const closePopover = useCallback(() => {
    setOpen(false);
    setPinned?.(false);
    savedSelection.current = null;
  }, [setPinned]);

  // ⌘K (dispatched by FormatShortcutsPlugin) opens this popover for the selection.
  useEffect(() => {
    if (!editor) return;
    return editor.registerCommand(
      OPEN_LINK_POPOVER_COMMAND,
      () => {
        openPopover();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, openPopover]);

  if (!toolbar || !editor) return null;

  /** Re-select the saved span, then run `fn` against it, then drop the popover. */
  const withSavedSelection = (fn: () => void) => {
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      fn();
    });
    editor.focus();
    closePopover();
  };

  const apply = ({ href }: LinkFormResult) => {
    withSavedSelection(() => {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, href);
    });
  };

  const remove = () => {
    withSavedSelection(() => {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    });
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => (next ? openPopover() : closePopover())}
      width="lg"
      trigger={
        <IconButton
          icon={MdLink}
          label="Link"
          tooltip={
            <Inline gap="xs">
              Link
              <Kbd>⌘K</Kbd>
            </Inline>
          }
          aria-pressed={activeLink !== null}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            activeLink !== null && "bg-accent text-accent-foreground",
          )}
        />
      }
    >
      <LinkForm
        initialUrl={activeLink ?? ""}
        canRemove={activeLink !== null}
        onApply={apply}
        onRemove={remove}
        onCancel={closePopover}
      />
    </InlinePopover>
  );
}
