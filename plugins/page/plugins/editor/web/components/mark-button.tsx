import type { ComponentType, ReactNode } from "react";
import { FORMAT_TEXT_COMMAND } from "lexical";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type { Mark } from "../../core";
import { useFormatToolbar } from "../internal/format-toolbar-context";

export interface MarkButtonProps {
  /** The boolean mark this button toggles. */
  mark: Mark;
  /** Icon glyph (e.g. `MdFormatBold`). */
  icon: ComponentType<{ className?: string }>;
  /** Accessible label + tooltip text. */
  label: string;
  /** Optional shortcut hint shown in the tooltip (e.g. `<Kbd>⌘B</Kbd>`). */
  shortcutHint?: ReactNode;
}

/**
 * The single home for a boolean-mark toolbar button. Reads the live `active`
 * snapshot from `FormatToolbarContext` (no per-button selection listener) and on
 * click dispatches `FORMAT_TEXT_COMMAND(mark)` against the toolbar's editor.
 *
 * `onMouseDown` preventDefault keeps the DOM text selection intact when the
 * button is clicked, so toggling a mark applies to the still-selected span
 * instead of collapsing the caret. Each mark sub-plugin is a one-line wrapper
 * around this component.
 */
export function MarkButton({ mark, icon, label, shortcutHint }: MarkButtonProps) {
  const toolbar = useFormatToolbar();
  if (!toolbar) return null;
  const isActive = toolbar.active[mark];

  return (
    <IconButton
      icon={icon}
      label={label}
      tooltip={
        shortcutHint ? (
          <span className="inline-flex items-center gap-xs">
            {label}
            {shortcutHint}
          </span>
        ) : (
          label
        )
      }
      aria-pressed={isActive}
      // Keep the editor's text selection: clicking the button must not blur/move
      // the caret, or the mark would toggle nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => toolbar.editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark)}
      className={cn(isActive && "bg-accent text-accent-foreground")}
    />
  );
}
